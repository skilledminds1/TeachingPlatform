"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { bookingIdSchema, videoSessionIdSchema } from "@/lib/validations/video";
import { requireAuth } from "@/server/auth/session";
import { createLiveKitToken } from "@/services/livekit/tokens";
import { fail, ok, type ActionResult } from "@/types/action";

export async function confirmBookingAndCreateRoom(
  bookingId: string,
): Promise<ActionResult<{ sessionId: string }>> {
  const parsed = bookingIdSchema.safeParse(bookingId);
  if (!parsed.success) return fail("Invalid booking.", "VALIDATION_ERROR");
  await requireAuth();
  return fail(
    "Lessons are confirmed automatically after a verified student payment.",
    "FORBIDDEN",
  );
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
