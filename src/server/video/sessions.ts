import { db } from "@/lib/db";
import { requireAuth } from "@/server/auth/session";
import { createLiveKitRoom } from "@/services/livekit/rooms";

export async function ensureVideoSessionForBooking(bookingId: string) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      videoSession: true,
      organization: { select: { plan: { select: { videoSessions: true } } } },
    },
  });
  if (!booking) throw new Error("Booking not found.");
  if (!booking.organization.plan.videoSessions) {
    throw new Error("Video sessions are not available on this plan.");
  }
  if (booking.status === "cancelled" || booking.startsAt <= new Date()) {
    throw new Error("A room cannot be created for this booking.");
  }

  const room = await createLiveKitRoom({
    bookingId: booking.id,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
  });
  return db.videoSession.upsert({
    where: { bookingId: booking.id },
    update: { livekitRoomName: room.name },
    create: {
      bookingId: booking.id,
      livekitRoomName: room.name,
      status: "scheduled",
    },
  });
}

export async function getSessionForParticipant(sessionId: string) {
  const user = await requireAuth();
  let session = await db.videoSession.findFirst({
    where: {
      id: sessionId,
      booking: { OR: [{ teacherId: user.id }, { studentId: user.id }] },
    },
    include: {
      booking: {
        include: {
          teacher: { select: { id: true, name: true } },
          student: { select: { id: true, name: true } },
          review: { select: { id: true, rating: true, comment: true, status: true } },
        },
      },
    },
  });
  if (!session) return null;

  const expired = new Date() > new Date(session.booking.endsAt.getTime() + 30 * 60_000);
  if (expired && session.status !== "ended") {
    const finalBookingStatus = session.status === "live" ? "completed" : "no_show";
    await db.$transaction([
      db.videoSession.update({
        where: { id: session.id },
        data: { status: "ended", endedAt: new Date() },
      }),
      db.booking.update({
        where: { id: session.bookingId },
        data: { status: finalBookingStatus },
      }),
    ]);
    session = {
      ...session,
      status: "ended",
      endedAt: new Date(),
      booking: { ...session.booking, status: finalBookingStatus },
    };
  }

  return {
    ...session,
    participant: user,
    isTeacher: session.booking.teacherId === user.id,
    otherPerson:
      session.booking.teacherId === user.id
        ? session.booking.student
        : session.booking.teacher,
  };
}
