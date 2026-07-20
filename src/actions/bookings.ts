"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { LESSON_DURATION_MINUTES } from "@/lib/timezone";
import {
  cancelBookingSchema,
  createBookingSchema,
  proposeBookingRescheduleSchema,
  respondBookingRescheduleSchema,
  scheduleLessonAsTeacherSchema,
} from "@/lib/validations/bookings";
import { getAvailableSlots } from "@/server/availability/slots";
import { requireAuth, requireTeacher } from "@/server/auth/session";
import { getOrganizationGrowthWriteBlock } from "@/server/billing/write-gate";
import {
  removeBookingFromConnectedCalendars,
  updateEventsForBooking,
} from "@/server/integrations/google-calendar";
import {
  notifyBookingCreated,
  notifyBookingCancelled,
  notifyRescheduleAccepted,
  notifyRescheduleDeclined,
  notifyRescheduleProposed,
} from "@/server/notifications/notify";
import { paymentWindowExpiry } from "@/server/payments/confirm";
import { enforceActionRateLimit } from "@/server/security/action-rate-limit";
import { getScopeRestriction, usersHaveBlock } from "@/server/trust/enforcement";
import { deleteLiveKitRoom } from "@/services/livekit/rooms";
import { fail, ok, type ActionResult } from "@/types/action";

const RESCHEDULE_HOLD_HOURS = 48;

export async function createBooking(
  input: unknown,
): Promise<ActionResult<{ bookingId: string }>> {
  const parsed = createBookingSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid booking.", "VALIDATION_ERROR");
  }
  const student = await requireAuth();
  const limited = await enforceActionRateLimit({
    action: "booking-create",
    limit: 10,
    windowMs: 10 * 60_000,
    userId: student.id,
  });
  if (limited) return limited;
  const studentRestriction = await getScopeRestriction(student.id, "booking");
  if (studentRestriction) return fail(studentRestriction, "FORBIDDEN");
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
  const billingBlock = await getOrganizationGrowthWriteBlock(profile.organizationId);
  if (billingBlock) return fail(billingBlock, "FORBIDDEN");
  if (profile.userId === student.id) return fail("You cannot book yourself.", "VALIDATION_ERROR");
  if (await usersHaveBlock(student.id, profile.userId)) {
    return fail("You cannot create a new booking with this user.", "FORBIDDEN");
  }
  const teacherRestriction = await getScopeRestriction(profile.userId, "selling");
  if (teacherRestriction) return fail("This teacher is not accepting new bookings.", "FORBIDDEN");

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

          const proposalHold = await tx.bookingRescheduleProposal.findFirst({
            where: {
              status: "pending",
              expiresAt: { gt: new Date() },
              proposedStartsAt: { lt: endsAt },
              proposedEndsAt: { gt: startsAt },
              booking: { teacherId: profile.userId },
            },
            select: { id: true },
          });
          if (proposalHold) return { conflict: true as const };

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
              paymentExpiresAt: paymentWindowExpiry(),
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
      revalidatePath(`/find-tutor/${parsed.data.teacherSlug}`);
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

export async function scheduleLessonAsTeacher(
  input: unknown,
): Promise<ActionResult<{ bookingId: string }>> {
  const parsed = scheduleLessonAsTeacherSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid booking.", "VALIDATION_ERROR");
  }

  const teacher = await requireTeacher();
  const limited = await enforceActionRateLimit({
    action: "booking-create",
    limit: 20,
    windowMs: 10 * 60_000,
    userId: teacher.id,
  });
  if (limited) return limited;
  const teacherRestriction = await getScopeRestriction(teacher.id, "booking");
  if (teacherRestriction) return fail(teacherRestriction, "FORBIDDEN");
  const startsAt = new Date(parsed.data.startsAt);
  if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) {
    return fail("You can't schedule a lesson in the past.", "VALIDATION_ERROR");
  }
  const endsAt = new Date(startsAt.getTime() + LESSON_DURATION_MINUTES * 60_000);

  const profile = await db.teacherProfile.findUnique({
    where: { userId: teacher.id },
    select: {
      userId: true,
      organizationId: true,
      hourlyRateCents: true,
      currency: true,
      slug: true,
      status: true,
      deletedAt: true,
    },
  });
  if (!profile || profile.status !== "approved" || profile.deletedAt) {
    return fail("Your teacher profile must be approved before scheduling.", "FORBIDDEN");
  }
  const billingBlock = await getOrganizationGrowthWriteBlock(profile.organizationId);
  if (billingBlock) return fail(billingBlock, "FORBIDDEN");

  const relationship = await db.studentRelationship.findFirst({
    where: {
      teacherId: teacher.id,
      studentId: parsed.data.studentId,
      status: "active",
    },
    select: { studentId: true },
  });
  if (!relationship) {
    return fail("Choose one of your existing students.", "VALIDATION_ERROR");
  }
  if (await usersHaveBlock(teacher.id, relationship.studentId)) {
    return fail("You cannot create a new booking with this user.", "FORBIDDEN");
  }

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

          const proposalHold = await tx.bookingRescheduleProposal.findFirst({
            where: {
              status: "pending",
              expiresAt: { gt: new Date() },
              proposedStartsAt: { lt: endsAt },
              proposedEndsAt: { gt: startsAt },
              booking: { teacherId: profile.userId },
            },
            select: { id: true },
          });
          if (proposalHold) return { conflict: true as const };

          const organization = await tx.organization.findUniqueOrThrow({
            where: { id: profile.organizationId },
            select: {
              plan: {
                select: {
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

          const booking = await tx.booking.create({
            data: {
              teacherId: profile.userId,
              studentId: relationship.studentId,
              organizationId: profile.organizationId,
              startsAt,
              endsAt,
              status: "pending_payment",
              hourlyRateCents: profile.hourlyRateCents,
              currency: profile.currency,
              paymentExpiresAt: paymentWindowExpiry(),
            },
          });
          return { booking };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      if ("conflict" in result) {
        return fail("That time was just booked. Choose another slot.", "CONFLICT");
      }
      if (
        "lessonLimit" in result &&
        result.lessonLimit &&
        result.usedMinutes !== undefined &&
        result.monthlyLiveLessonMinutes !== undefined
      ) {
        return fail(
          `You have used ${result.usedMinutes / 60} of ${
            result.monthlyLiveLessonMinutes / 60
          } live lesson hours this month. Upgrade is required before scheduling another lesson.`,
          "PLAN_LIMIT_EXCEEDED",
        );
      }

      revalidatePath("/dashboard");
      revalidatePath("/dashboard/teacher/bookings");
      if (profile.slug) revalidatePath(`/find-tutor/${profile.slug}`);
      await notifyBookingCreated(result.booking.id).catch(() => undefined);
      revalidatePath("/dashboard/notifications");
      return ok({ bookingId: result.booking.id });
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === 2) throw error;
    }
  }

  return fail("Could not schedule that lesson. Please try again.", "CONFLICT");
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
      hourlyRateCents: true,
      currency: true,
      paymentProvider: true,
      paymentExternalId: true,
      videoSession: { select: { livekitRoomName: true } },
      paymentAttempts: {
        where: { status: { in: ["succeeded", "partially_refunded"] } },
        orderBy: { succeededAt: "desc" },
        take: 1,
        select: {
          id: true,
          provider: true,
          providerPaymentId: true,
          teacherMerchantId: true,
          amountCents: true,
          currency: true,
          refundedCents: true,
        },
      },
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

  const hoursUntil = (booking.startsAt.getTime() - Date.now()) / 3_600_000;
  const attempt = booking.paymentAttempts[0];
  await db.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: "cancelled", cancellationReason: parsed.data.reason },
    });

    if (booking.status === "confirmed" && attempt) {
      await tx.refundRequest.upsert({
        where: { bookingId: booking.id },
        create: {
          bookingId: booking.id,
          paymentAttemptId: attempt.id,
          studentId: booking.studentId,
          teacherId: booking.teacherId,
          requestedAmountCents: attempt.amountCents - attempt.refundedCents,
          currency: attempt.currency,
          reason: parsed.data.reason,
          policyEligible: user.id === booking.teacherId || hoursUntil >= 24,
        },
        update: {},
      });
    }
  });
  if (booking.videoSession) {
    await deleteLiveKitRoom(booking.videoSession.livekitRoomName);
  }
  await removeBookingFromConnectedCalendars(booking.id).catch(() => undefined);
  await notifyBookingCancelled(booking.id).catch(() => undefined);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/teacher/bookings");
  return ok({ cancelled: true });
}

async function findSlotHold(input: {
  teacherId: string;
  startsAt: Date;
  endsAt: Date;
  excludeBookingId?: string;
}) {
  const [bookingCollision, proposalCollision] = await Promise.all([
    db.booking.findFirst({
      where: {
        teacherId: input.teacherId,
        id: input.excludeBookingId ? { not: input.excludeBookingId } : undefined,
        status: { in: ["pending_payment", "confirmed"] },
        startsAt: { lt: input.endsAt },
        endsAt: { gt: input.startsAt },
      },
      select: { id: true },
    }),
    db.bookingRescheduleProposal.findFirst({
      where: {
        status: "pending",
        expiresAt: { gt: new Date() },
        proposedStartsAt: { lt: input.endsAt },
        proposedEndsAt: { gt: input.startsAt },
        booking: {
          teacherId: input.teacherId,
          ...(input.excludeBookingId ? { id: { not: input.excludeBookingId } } : {}),
        },
      },
      select: { id: true },
    }),
  ]);
  return Boolean(bookingCollision || proposalCollision);
}

export async function proposeBookingReschedule(
  input: unknown,
): Promise<ActionResult<{ proposalId: string }>> {
  const parsed = proposeBookingRescheduleSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid reschedule.", "VALIDATION_ERROR");
  }

  const teacher = await requireTeacher();
  const startsAt = new Date(parsed.data.startsAt);
  if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) {
    return fail("Choose a future lesson time.", "VALIDATION_ERROR");
  }
  const endsAt = new Date(startsAt.getTime() + LESSON_DURATION_MINUTES * 60_000);

  const booking = await db.booking.findFirst({
    where: {
      id: parsed.data.bookingId,
      teacherId: teacher.id,
      status: "confirmed",
    },
    select: {
      id: true,
      teacherId: true,
      studentId: true,
      organizationId: true,
      startsAt: true,
      endsAt: true,
      status: true,
    },
  });
  if (!booking) return fail("Confirmed lesson not found.", "NOT_FOUND");
  if (booking.startsAt <= new Date()) {
    return fail("Past lessons cannot be rescheduled.", "CONFLICT");
  }

  if (booking.startsAt.getTime() === startsAt.getTime()) {
    return fail("Choose a different time from the current lesson.", "VALIDATION_ERROR");
  }

  const held = await findSlotHold({
    teacherId: booking.teacherId,
    startsAt,
    endsAt,
    excludeBookingId: booking.id,
  });
  if (held) {
    return fail("That time is no longer available. Choose another slot.", "CONFLICT");
  }

  const organization = await db.organization.findUniqueOrThrow({
    where: { id: booking.organizationId },
    select: { plan: { select: { monthlyLiveLessonMinutes: true } } },
  });
  const lessonLimit = organization.plan.monthlyLiveLessonMinutes;
  if (lessonLimit !== null) {
    const periodStart = new Date(Date.UTC(startsAt.getUTCFullYear(), startsAt.getUTCMonth(), 1));
    const periodEnd = new Date(Date.UTC(startsAt.getUTCFullYear(), startsAt.getUTCMonth() + 1, 1));
    const originalMonthStart = new Date(
      Date.UTC(booking.startsAt.getUTCFullYear(), booking.startsAt.getUTCMonth(), 1),
    );
    const sameMonth = originalMonthStart.getTime() === periodStart.getTime();
    const reservedBookings = await db.booking.findMany({
      where: {
        organizationId: booking.organizationId,
        startsAt: { gte: periodStart, lt: periodEnd },
        status: { in: ["pending_payment", "confirmed", "completed"] },
        ...(sameMonth ? { id: { not: booking.id } } : {}),
      },
      select: { startsAt: true, endsAt: true },
    });
    const usedMinutes = reservedBookings.reduce(
      (total, item) =>
        total +
        Math.max(0, Math.round((item.endsAt.getTime() - item.startsAt.getTime()) / 60_000)),
      0,
    );
    if (usedMinutes + LESSON_DURATION_MINUTES > lessonLimit) {
      return fail(
        "Moving this lesson would exceed your monthly live lesson hours.",
        "PLAN_LIMIT_EXCEEDED",
      );
    }
  }

  const proposal = await db.$transaction(async (tx) => {
    await tx.bookingRescheduleProposal.updateMany({
      where: { bookingId: booking.id, status: "pending" },
      data: { status: "cancelled", respondedAt: new Date() },
    });
    return tx.bookingRescheduleProposal.create({
      data: {
        bookingId: booking.id,
        proposedById: teacher.id,
        proposedStartsAt: startsAt,
        proposedEndsAt: endsAt,
        reason: parsed.data.reason?.trim() || null,
        status: "pending",
        expiresAt: new Date(Date.now() + RESCHEDULE_HOLD_HOURS * 3_600_000),
      },
    });
  });

  await notifyRescheduleProposed(proposal.id).catch(() => undefined);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/teacher/bookings");
  revalidatePath(`/dashboard/bookings/${booking.id}`);
  revalidatePath("/dashboard/notifications");
  return ok({ proposalId: proposal.id });
}

export async function acceptBookingReschedule(
  input: unknown,
): Promise<ActionResult<{ bookingId: string }>> {
  const parsed = respondBookingRescheduleSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid response.", "VALIDATION_ERROR");
  }
  const student = await requireAuth();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await db.$transaction(
        async (tx) => {
          const proposal = await tx.bookingRescheduleProposal.findUnique({
            where: { id: parsed.data.proposalId },
            include: {
              booking: {
                select: {
                  id: true,
                  teacherId: true,
                  studentId: true,
                  status: true,
                  startsAt: true,
                },
              },
            },
          });
          if (!proposal) return { notFound: true as const };
          if (proposal.booking.studentId !== student.id) return { forbidden: true as const };
          if (proposal.status !== "pending") return { conflict: true as const };
          if (proposal.expiresAt <= new Date()) {
            await tx.bookingRescheduleProposal.update({
              where: { id: proposal.id },
              data: { status: "expired", respondedAt: new Date() },
            });
            return { expired: true as const };
          }
          if (proposal.booking.status !== "confirmed" || proposal.booking.startsAt <= new Date()) {
            return { conflict: true as const };
          }

          const collision = await tx.booking.findFirst({
            where: {
              teacherId: proposal.booking.teacherId,
              id: { not: proposal.booking.id },
              status: { in: ["pending_payment", "confirmed"] },
              startsAt: { lt: proposal.proposedEndsAt },
              endsAt: { gt: proposal.proposedStartsAt },
            },
            select: { id: true },
          });
          const held = await tx.bookingRescheduleProposal.findFirst({
            where: {
              id: { not: proposal.id },
              status: "pending",
              expiresAt: { gt: new Date() },
              proposedStartsAt: { lt: proposal.proposedEndsAt },
              proposedEndsAt: { gt: proposal.proposedStartsAt },
              booking: { teacherId: proposal.booking.teacherId },
            },
            select: { id: true },
          });
          if (collision || held) return { slotTaken: true as const };

          await tx.booking.update({
            where: { id: proposal.booking.id },
            data: {
              startsAt: proposal.proposedStartsAt,
              endsAt: proposal.proposedEndsAt,
            },
          });
          await tx.bookingRescheduleProposal.update({
            where: { id: proposal.id },
            data: { status: "accepted", respondedAt: new Date() },
          });
          await tx.bookingRescheduleProposal.updateMany({
            where: {
              bookingId: proposal.booking.id,
              status: "pending",
              id: { not: proposal.id },
            },
            data: { status: "cancelled", respondedAt: new Date() },
          });
          return { bookingId: proposal.booking.id, proposalId: proposal.id };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      if ("notFound" in result) return fail("Proposal not found.", "NOT_FOUND");
      if ("forbidden" in result) return fail("You cannot respond to this proposal.", "FORBIDDEN");
      if ("expired" in result) return fail("This reschedule proposal has expired.", "CONFLICT");
      if ("slotTaken" in result) {
        return fail("That time was just taken. Ask your teacher for another slot.", "CONFLICT");
      }
      if ("conflict" in result) {
        return fail("This lesson can no longer be rescheduled.", "CONFLICT");
      }

      await notifyRescheduleAccepted(result.proposalId).catch(() => undefined);
      await updateEventsForBooking(result.bookingId).catch(() => undefined);
      revalidatePath("/dashboard");
      revalidatePath("/dashboard/teacher/bookings");
      revalidatePath(`/dashboard/bookings/${result.bookingId}`);
      revalidatePath("/dashboard/notifications");
      return ok({ bookingId: result.bookingId });
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === 2) throw error;
    }
  }

  return fail("Could not accept the new time. Please try again.", "CONFLICT");
}

export async function declineBookingReschedule(
  input: unknown,
): Promise<ActionResult<{ declined: true }>> {
  const parsed = respondBookingRescheduleSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid response.", "VALIDATION_ERROR");
  }
  const student = await requireAuth();

  const proposal = await db.bookingRescheduleProposal.findUnique({
    where: { id: parsed.data.proposalId },
    include: {
      booking: { select: { id: true, studentId: true } },
    },
  });
  if (!proposal) return fail("Proposal not found.", "NOT_FOUND");
  if (proposal.booking.studentId !== student.id) {
    return fail("You cannot respond to this proposal.", "FORBIDDEN");
  }
  if (proposal.status !== "pending") {
    return fail("This proposal is no longer pending.", "CONFLICT");
  }

  await db.bookingRescheduleProposal.update({
    where: { id: proposal.id },
    data: { status: "declined", respondedAt: new Date() },
  });

  await notifyRescheduleDeclined(proposal.id).catch(() => undefined);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/teacher/bookings");
  revalidatePath(`/dashboard/bookings/${proposal.booking.id}`);
  revalidatePath("/dashboard/notifications");
  return ok({ declined: true });
}
