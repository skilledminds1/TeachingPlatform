import { db } from "@/lib/db";
import { logger } from "@/lib/observability/logger";
import { requireAuth } from "@/server/auth/session";
import { createLiveKitRoom } from "@/services/livekit/rooms";

/** How long after the scheduled end a session is considered over. */
export const SESSION_GRACE_MINUTES = 30;

/**
 * Create (or refresh) the LiveKit room for a confirmed booking.
 *
 * Returns null instead of throwing for expected states. This runs immediately after the
 * payment transaction commits, un-caught, and a throw there means the provider webhook
 * returns 500 and retries forever while the student already holds a paid, confirmed booking.
 * The deterministic cases (plan without video, booking already started or cancelled) would
 * throw on every retry, so the payment could never be acknowledged.
 *
 * A genuine infrastructure failure still throws, so the caller can decide to retry.
 */
export async function ensureVideoSessionForBooking(bookingId: string) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      videoSession: true,
      organization: { select: { plan: { select: { videoSessions: true } } } },
    },
  });

  if (!booking) {
    logger.warn("video_session_booking_missing", { bookingId });
    return null;
  }
  if (!booking.organization.plan.videoSessions) {
    logger.warn("video_session_not_on_plan", { bookingId });
    return null;
  }
  if (booking.status === "cancelled") {
    logger.warn("video_session_booking_cancelled", { bookingId });
    return null;
  }

  // Reuse an existing room rather than minting a new name: a join link may already have been
  // emailed, and replacing livekitRoomName would silently invalidate it.
  if (booking.videoSession) return booking.videoSession;

  // A late payment can confirm a booking whose start time has passed. Room creation must
  // still succeed — refusing here leaves a paid lesson with no way to meet.
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

type FinalizableSession = {
  id: string;
  bookingId: string;
  status: string;
  booking: { status: string; endsAt: Date };
};

export function sessionIsExpired(endsAt: Date, now = new Date()): boolean {
  return now > new Date(endsAt.getTime() + SESSION_GRACE_MINUTES * 60_000);
}

/**
 * Close out a session whose grace period has passed.
 *
 * A session that went live is `completed`; one that never did is `no_show`. Returns the
 * booking status applied, or null when nothing changed.
 *
 * The booking transition is scoped to `confirmed`. Without that guard, opening the session
 * page for a booking that was properly cancelled (and possibly refunded) after its scheduled
 * end rewrote it to `no_show`, destroying the cancellation record and inflating the
 * teacher's no-show rate.
 */
export async function finalizeExpiredSession(
  session: FinalizableSession,
  now = new Date(),
): Promise<"completed" | "no_show" | null> {
  if (session.status === "ended") return null;
  if (!sessionIsExpired(session.booking.endsAt, now)) return null;

  const finalBookingStatus = session.status === "live" ? "completed" : "no_show";

  const applied = await db.$transaction(async (tx) => {
    const booking = await tx.booking.updateMany({
      where: { id: session.bookingId, status: "confirmed" },
      data: { status: finalBookingStatus },
    });
    await tx.videoSession.updateMany({
      where: { id: session.id, status: { not: "ended" } },
      data: { status: "ended", endedAt: now },
    });
    return booking.count > 0;
  });

  return applied ? finalBookingStatus : null;
}

/**
 * Close out every session whose grace period has passed.
 *
 * Finalisation previously happened only when the teacher clicked "End" or somebody happened
 * to reload the session page. If neither occurred the booking stayed `confirmed` forever:
 * the student never saw the review form, teacher analytics undercounted lessons, refund
 * eligibility was wrong, and the platform's own north-star metric (completed sessions per
 * month) was silently deflated.
 */
export async function finalizeExpiredSessions(
  now = new Date(),
  take = 200,
): Promise<{ completed: number; noShow: number }> {
  const cutoff = new Date(now.getTime() - SESSION_GRACE_MINUTES * 60_000);
  const sessions = await db.videoSession.findMany({
    where: {
      status: { not: "ended" },
      booking: { status: "confirmed", endsAt: { lte: cutoff } },
    },
    select: {
      id: true,
      bookingId: true,
      status: true,
      booking: { select: { status: true, endsAt: true } },
    },
    take,
  });

  let completed = 0;
  let noShow = 0;
  for (const session of sessions) {
    const result = await finalizeExpiredSession(session, now).catch((error) => {
      logger.warn("session_finalize_failed", { sessionId: session.id, error });
      return null;
    });
    if (result === "completed") completed += 1;
    if (result === "no_show") noShow += 1;
  }

  return { completed, noShow };
}

export async function getSessionForParticipant(sessionId: string) {
  const user = await requireAuth();
  const session = await db.videoSession.findFirst({
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

  // Lazy finalisation is kept as a fallback for the scheduled job, so a session the cron has
  // not reached yet still reads correctly to whoever opens it.
  const finalBookingStatus = await finalizeExpiredSession(session);

  const view = finalBookingStatus
    ? ({
        ...session,
        status: "ended",
        endedAt: new Date(),
        booking: { ...session.booking, status: finalBookingStatus },
      } as typeof session)
    : session;

  return {
    ...view,
    participant: user,
    isTeacher: view.booking.teacherId === user.id,
    otherPerson:
      view.booking.teacherId === user.id ? view.booking.student : view.booking.teacher,
  };
}
