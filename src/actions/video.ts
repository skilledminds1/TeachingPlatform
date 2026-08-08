"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { bookingIdSchema, videoSessionIdSchema } from "@/lib/validations/video";
import { requireAuth } from "@/server/auth/session";
import {
  acceptBookingRequest,
  declineBookingRequest,
} from "@/server/bookings/confirmation";
import { createLiveKitToken } from "@/services/livekit/tokens";
import { fail, ok, type ActionResult } from "@/types/action";

/**
 * The teacher accepts a booking request, which is what confirms a lesson and provisions its
 * video room. Previously this returned FORBIDDEN unconditionally, deferring to a payment
 * capture that no configuration could reach — so nothing on the platform could ever be
 * confirmed. See src/server/bookings/confirmation.ts.
 */
export async function confirmBookingAndCreateRoom(
  bookingId: string,
): Promise<ActionResult<{ sessionId: string }>> {
  const parsed = bookingIdSchema.safeParse(bookingId);
  if (!parsed.success) return fail("Invalid booking.", "VALIDATION_ERROR");
  const teacher = await requireAuth();

  const result = await acceptBookingRequest({ bookingId: parsed.data, teacherId: teacher.id });
  if (!result.ok) {
    if (result.reason === "not_found") return fail("Booking not found.", "NOT_FOUND");
    if (result.reason === "not_teacher") {
      return fail("Only the teacher can accept this lesson.", "FORBIDDEN");
    }
    return fail("This lesson is no longer awaiting your answer.", "CONFLICT");
  }

  const session = await db.videoSession.findUnique({
    where: { bookingId: result.bookingId },
    select: { id: true },
  });
  revalidatePath(`/dashboard/bookings/${result.bookingId}`);
  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard/teacher/bookings");
  revalidatePath("/dashboard/teacher");

  // The room is provisioned inside acceptBookingRequest, but a LiveKit outage must not undo an
  // acceptance the teacher already made — so a missing session is reported, not treated as a
  // failed confirmation. The session page creates it on demand.
  if (!session) {
    return fail(
      "Lesson confirmed, but the video room could not be created yet. Open the lesson to retry.",
      "INTERNAL_ERROR",
    );
  }
  return ok({ sessionId: session.id });
}

export async function declineBooking(
  bookingId: string,
  reason: string,
): Promise<ActionResult<{ declined: true }>> {
  const parsed = bookingIdSchema.safeParse(bookingId);
  if (!parsed.success) return fail("Invalid booking.", "VALIDATION_ERROR");
  const teacher = await requireAuth();

  const trimmed = reason.trim();
  if (trimmed.length < 5 || trimmed.length > 500) {
    return fail("Give the student a short reason (5–500 characters).", "VALIDATION_ERROR");
  }

  const result = await declineBookingRequest({
    bookingId: parsed.data,
    teacherId: teacher.id,
    reason: trimmed,
  });
  if (!result.ok) {
    if (result.reason === "not_found") return fail("Booking not found.", "NOT_FOUND");
    if (result.reason === "not_teacher") {
      return fail("Only the teacher can decline this lesson.", "FORBIDDEN");
    }
    return fail("This lesson is no longer awaiting your answer.", "CONFLICT");
  }

  revalidatePath(`/dashboard/bookings/${result.bookingId}`);
  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard/teacher/bookings");
  return ok({ declined: true });
}

export async function startSession(
  sessionId: string,
): Promise<ActionResult<{ started: true }>> {
  const parsed = videoSessionIdSchema.safeParse(sessionId);
  if (!parsed.success) return fail("Invalid session.", "VALIDATION_ERROR");
  const teacher = await requireAuth();
  const session = await db.videoSession.findUnique({
    where: { id: parsed.data },
    include: { booking: true },
  });
  if (!session) return fail("Session not found.", "NOT_FOUND");
  if (session.booking.teacherId !== teacher.id) {
    return fail("Only the teacher can start this lesson.", "FORBIDDEN");
  }
  if (session.booking.status !== "confirmed" || session.status !== "scheduled") {
    return fail("This lesson cannot be started.", "CONFLICT");
  }
  const earliest = new Date(session.booking.startsAt.getTime() - 15 * 60_000);
  const latest = new Date(session.booking.endsAt.getTime() + 30 * 60_000);
  const now = new Date();
  if (now < earliest) return fail("The lobby opens 15 minutes before the lesson.", "CONFLICT");
  if (now > latest) return fail("This lesson window has ended.", "CONFLICT");

  await db.videoSession.update({
    where: { id: session.id },
    data: { status: "live", startedAt: now },
  });
  revalidateBookingPages(session.bookingId, session.id);
  return ok({ started: true });
}

export async function getJoinCredentials(
  sessionId: string,
): Promise<ActionResult<{ serverUrl: string; token: string }>> {
  const parsed = videoSessionIdSchema.safeParse(sessionId);
  if (!parsed.success) return fail("Invalid session.", "VALIDATION_ERROR");
  const user = await requireAuth();
  const session = await db.videoSession.findUnique({
    where: { id: parsed.data },
    include: {
      booking: {
        include: {
          teacher: { select: { name: true } },
          student: { select: { name: true } },
        },
      },
    },
  });
  if (!session) return fail("Session not found.", "NOT_FOUND");
  const isTeacher = session.booking.teacherId === user.id;
  const isStudent = session.booking.studentId === user.id;
  if (!isTeacher && !isStudent) return fail("You cannot join this lesson.", "FORBIDDEN");
  if (session.booking.status !== "confirmed" || session.status !== "live") {
    return fail("The teacher has not started this lesson yet.", "CONFLICT");
  }
  const latest = new Date(session.booking.endsAt.getTime() + 30 * 60_000);
  if (new Date() > latest) return fail("This lesson has ended.", "CONFLICT");

  try {
    const credentials = await createLiveKitToken({
      roomName: session.livekitRoomName,
      userId: user.id,
      userName: isTeacher ? session.booking.teacher.name : session.booking.student.name,
      isTeacher,
      endsAt: session.booking.endsAt,
    });
    return ok(credentials);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not create secure join credentials.",
      "INTERNAL_ERROR",
    );
  }
}

export async function endSession(
  sessionId: string,
): Promise<ActionResult<{ ended: true }>> {
  const parsed = videoSessionIdSchema.safeParse(sessionId);
  if (!parsed.success) return fail("Invalid session.", "VALIDATION_ERROR");
  const teacher = await requireAuth();
  const session = await db.videoSession.findUnique({
    where: { id: parsed.data },
    include: { booking: true },
  });
  if (!session) return fail("Session not found.", "NOT_FOUND");
  if (session.booking.teacherId !== teacher.id) {
    return fail("Only the teacher can end this lesson.", "FORBIDDEN");
  }
  if (session.status !== "live") return fail("This lesson is not live.", "CONFLICT");

  await db.$transaction([
    db.videoSession.update({
      where: { id: session.id },
      data: { status: "ended", endedAt: new Date() },
    }),
    db.booking.update({
      where: { id: session.bookingId },
      data: { status: "completed" },
    }),
  ]);
  revalidateBookingPages(session.bookingId, session.id);
  revalidatePath("/dashboard");
  return ok({ ended: true });
}

function revalidateBookingPages(bookingId: string, sessionId: string): void {
  revalidatePath(`/dashboard/bookings/${bookingId}`);
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard/teacher/bookings");
}
