"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { bookingIdSchema, videoSessionIdSchema } from "@/lib/validations/video";
import { requireAuth } from "@/server/auth/session";
import { notifyBookingConfirmed } from "@/server/notifications/notify";
import { ensureVideoSessionForBooking } from "@/server/video/sessions";
import { createLiveKitToken } from "@/services/livekit/tokens";
import { fail, ok, type ActionResult } from "@/types/action";

export async function confirmBookingAndCreateRoom(
  bookingId: string,
): Promise<ActionResult<{ sessionId: string }>> {
  const parsed = bookingIdSchema.safeParse(bookingId);
  if (!parsed.success) return fail("Invalid booking.", "VALIDATION_ERROR");
  const teacher = await requireAuth();
  const booking = await db.booking.findUnique({
    where: { id: parsed.data },
    select: { id: true, teacherId: true, status: true, startsAt: true },
  });
  if (!booking) return fail("Booking not found.", "NOT_FOUND");
  if (booking.teacherId !== teacher.id) {
    return fail("Only the booked teacher can confirm this lesson.", "FORBIDDEN");
  }
  if (booking.status !== "pending_payment") {
    return fail("Only pending bookings can be confirmed.", "CONFLICT");
  }
  if (booking.startsAt <= new Date()) return fail("This lesson has already started.", "CONFLICT");

  try {
    const session = await ensureVideoSessionForBooking(booking.id);
    await db.booking.update({
      where: { id: booking.id },
      data: { status: "confirmed" },
    });
    await notifyBookingConfirmed(booking.id).catch(() => undefined);
    revalidateBookingPages(booking.id, session.id);
    return ok({ sessionId: session.id });
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not provision the video room.",
      "INTERNAL_ERROR",
    );
  }
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
