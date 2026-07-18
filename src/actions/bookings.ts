"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { LESSON_DURATION_MINUTES } from "@/lib/timezone";
import {
  cancelBookingSchema,
  createBookingSchema,
} from "@/lib/validations/bookings";
import { getAvailableSlots } from "@/server/availability/slots";
import { requireAuth } from "@/server/auth/session";
import { notifyBookingCreated } from "@/server/notifications/notify";
import { deleteLiveKitRoom } from "@/services/livekit/rooms";
import { fail, ok, type ActionResult } from "@/types/action";

export async function createBooking(
  input: unknown,
): Promise<ActionResult<{ bookingId: string }>> {
  const parsed = createBookingSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid booking.", "VALIDATION_ERROR");
  }
  const student = await requireAuth();
  if (student.memberships.some((item) => item.role === "admin" || item.role === "instructor")) {
    return fail("Teacher accounts cannot book student lessons.", "FORBIDDEN");
  }

  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(startsAt.getTime() + LESSON_DURATION_MINUTES * 60_000);
  const availability = await getAvailableSlots(parsed.data.teacherSlug, {
    from: startsAt,
    days: 2,
  });
  if (!availability?.slots.some((slot) => new Date(slot.startsAt).getTime() === startsAt.getTime())) {
    return fail("That time is no longer available. Choose another slot.", "CONFLICT");
  }

  const profile = await db.teacherProfile.findFirst({
    where: { slug: parsed.data.teacherSlug, status: "approved", deletedAt: null },
    select: {
      userId: true,
      organizationId: true,
      hourlyRateCents: true,
      currency: true,
    },
  });
  if (!profile) return fail("Teacher not found.", "NOT_FOUND");
  if (profile.userId === student.id) return fail("You cannot book yourself.", "VALIDATION_ERROR");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await db.$transaction(
        async (tx) => {
          const collision = await tx.booking.findFirst({
            where: {
              teacherId: profile.userId,
              status: { in: ["pending_payment", "confirmed"] },
              startsAt: { lt: endsAt },
              endsAt: { gt: startsAt },
            },
            select: { id: true },
          });
          if (collision) return { conflict: true as const };

          const organization = await tx.organization.findUniqueOrThrow({
            where: { id: profile.organizationId },
            select: {
              plan: {
                select: {
                  studentLimit: true,
                  monthlyLiveLessonMinutes: true,
                },
              },
            },
          });
          const periodStart = new Date(
            Date.UTC(startsAt.getUTCFullYear(), startsAt.getUTCMonth(), 1),
          );
          const periodEnd = new Date(
            Date.UTC(startsAt.getUTCFullYear(), startsAt.getUTCMonth() + 1, 1),
          );
          const reservedBookings = await tx.booking.findMany({
            where: {
              organizationId: profile.organizationId,
              startsAt: { gte: periodStart, lt: periodEnd },
              status: { in: ["pending_payment", "confirmed", "completed"] },
            },
            select: { startsAt: true, endsAt: true },
          });
          const usedMinutes = reservedBookings.reduce(
            (total, item) =>
              total +
              Math.max(
                0,
                Math.round((item.endsAt.getTime() - item.startsAt.getTime()) / 60_000),
              ),
            0,
          );
          const lessonMinutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
          const lessonLimit = organization.plan.monthlyLiveLessonMinutes;
          if (lessonLimit !== null && usedMinutes + lessonMinutes > lessonLimit) {
            return {
              lessonLimit: true as const,
              usedMinutes,
              monthlyLiveLessonMinutes: lessonLimit,
            };
          }

          const relationship = await tx.studentRelationship.findUnique({
            where: {
              organizationId_teacherId_studentId: {
                organizationId: profile.organizationId,
                teacherId: profile.userId,
                studentId: student.id,
              },
            },
            select: { status: true },
          });
          if (relationship?.status !== "active") {
            const activeStudents = await tx.studentRelationship.count({
              where: { organizationId: profile.organizationId, status: "active" },
            });
            const limit = organization.plan.studentLimit;
            if (limit !== null && activeStudents >= limit) {
              return { limit: true as const, studentLimit: limit };
            }
            await tx.studentRelationship.upsert({
              where: {
                organizationId_teacherId_studentId: {
                  organizationId: profile.organizationId,
                  teacherId: profile.userId,
                  studentId: student.id,
                },
              },
              update: { status: "active" },
              create: {
                organizationId: profile.organizationId,
                teacherId: profile.userId,
                studentId: student.id,
                status: "active",
              },
            });
          }

          const booking = await tx.booking.create({
            data: {
              teacherId: profile.userId,
              studentId: student.id,
              organizationId: profile.organizationId,
              startsAt,
              endsAt,
              status: "pending_payment",
              hourlyRateCents: profile.hourlyRateCents,
              currency: profile.currency,
            },
          });
          return { booking };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      if ("conflict" in result) {
        return fail("That time was just booked. Choose another slot.", "CONFLICT");
      }
      if ("limit" in result) {
        return fail(
          `This teacher cannot accept new students right now (plan limit: ${result.studentLimit}).`,
          "PLAN_LIMIT_EXCEEDED",
        );
      }
      if (
        "lessonLimit" in result &&
        result.lessonLimit &&
        result.usedMinutes !== undefined &&
        result.monthlyLiveLessonMinutes !== undefined
      ) {
        return fail(
          `This teacher has used ${result.usedMinutes / 60} of ${
            result.monthlyLiveLessonMinutes / 60
          } live lesson hours this month. Upgrade is required before accepting another lesson.`,
          "PLAN_LIMIT_EXCEEDED",
        );
      }

      revalidatePath("/dashboard");
      revalidatePath("/dashboard/teacher/bookings");
      revalidatePath(`/teachers/${parsed.data.teacherSlug}`);
      await notifyBookingCreated(result.booking.id).catch(() => undefined);
      revalidatePath("/dashboard/notifications");
      return ok({ bookingId: result.booking.id });
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === 2) throw error;
    }
  }

  return fail("Could not reserve that time. Please try again.", "CONFLICT");
}

export async function cancelBooking(
  input: unknown,
): Promise<ActionResult<{ cancelled: true }>> {
  const parsed = cancelBookingSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid cancellation.", "VALIDATION_ERROR");
  }
  const user = await requireAuth();
  const booking = await db.booking.findUnique({
    where: { id: parsed.data.bookingId },
    select: {
      id: true,
      teacherId: true,
      studentId: true,
      startsAt: true,
      status: true,
      videoSession: { select: { livekitRoomName: true } },
    },
  });
  if (!booking) return fail("Booking not found.", "NOT_FOUND");
  if (booking.teacherId !== user.id && booking.studentId !== user.id) {
    return fail("You cannot cancel this booking.", "FORBIDDEN");
  }
  if (!["pending_payment", "confirmed"].includes(booking.status)) {
    return fail("Only upcoming bookings can be cancelled.", "CONFLICT");
  }
  if (booking.startsAt <= new Date()) {
    return fail("Past lessons cannot be cancelled.", "CONFLICT");
  }

  await db.booking.update({
    where: { id: booking.id },
    data: { status: "cancelled", cancellationReason: parsed.data.reason },
  });
  if (booking.videoSession) {
    await deleteLiveKitRoom(booking.videoSession.livekitRoomName);
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/teacher/bookings");
  return ok({ cancelled: true });
}
