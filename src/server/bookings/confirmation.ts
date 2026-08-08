import { db } from "@/lib/db";
import { logger } from "@/lib/observability/logger";
import { notifyBookingCancelled, notifyBookingConfirmed } from "@/server/notifications/notify";
import { ensureVideoSessionForBooking } from "@/server/video/sessions";

/**
 * Booking confirmation, decoupled from money.
 *
 * The platform never receives lesson money and gets no webhook from the teacher's own payment
 * provider, so it cannot wait for a payment it will never be told about. Until this module
 * existed the only writer of `confirmed` was the PayPal capture path — double-gated off — so
 * no booking could ever be confirmed and no video room was ever provisioned.
 *
 * What confirms a lesson now is the teacher accepting it. Payment is a matter between the two
 * of them, recorded (later) as an annotation that gates nothing.
 */

/**
 * How long a request waits for an answer.
 *
 * The old window was 30 minutes, sized for a checkout redirect. A human answering a booking
 * request is not a checkout — a teacher asleep in another timezone must not lose the lesson —
 * so the window is three days.
 */
export const CONFIRMATION_WINDOW_HOURS = 72;

export function confirmationWindowExpiry(from = new Date()): Date {
  return new Date(from.getTime() + CONFIRMATION_WINDOW_HOURS * 60 * 60_000);
}

export type ConfirmationOutcome =
  | { ok: true; bookingId: string }
  | { ok: false; reason: "not_found" | "not_teacher" | "not_pending" };

/**
 * Accept a booking request.
 *
 * The transition is conditional on the row still being `pending_teacher_confirmation`, so an
 * accept that races an expiry or a student cancellation loses rather than resurrecting a dead
 * booking — the same guard the payment path needed for the same reason.
 *
 * Room provisioning and notification happen after the transaction commits. Neither may fail
 * the acceptance: a teacher who accepted must not be told it failed because LiveKit was slow,
 * and `ensureVideoSessionForBooking` is idempotent, so the session page can create the room
 * on demand if this call did not.
 */
export async function acceptBookingRequest(input: {
  bookingId: string;
  teacherId: string;
}): Promise<ConfirmationOutcome> {
  const booking = await db.booking.findUnique({
    where: { id: input.bookingId },
    select: { id: true, teacherId: true, status: true },
  });
  if (!booking) return { ok: false, reason: "not_found" };
  if (booking.teacherId !== input.teacherId) return { ok: false, reason: "not_teacher" };
  if (booking.status !== "pending_teacher_confirmation") {
    return { ok: false, reason: "not_pending" };
  }

  const accepted = await db.booking.updateMany({
    where: { id: booking.id, status: "pending_teacher_confirmation" },
    data: { status: "confirmed", confirmationExpiresAt: null },
  });
  if (accepted.count === 0) return { ok: false, reason: "not_pending" };

  await ensureVideoSessionForBooking(booking.id).catch((error) => {
    logger.error("booking_room_provisioning_failed", { bookingId: booking.id, error });
    return null;
  });
  await notifyBookingConfirmed(booking.id).catch((error) => {
    logger.warn("booking_confirmation_notification_failed", { bookingId: booking.id, error });
  });
  const { syncBookingToConnectedCalendars } = await import(
    "@/server/integrations/google-calendar"
  );
  await syncBookingToConnectedCalendars(booking.id).catch((error) => {
    logger.warn("booking_calendar_sync_failed", { bookingId: booking.id, error });
  });

  return { ok: true, bookingId: booking.id };
}

/** Decline a request, releasing the slot immediately. */
export async function declineBookingRequest(input: {
  bookingId: string;
  teacherId: string;
  reason: string;
}): Promise<ConfirmationOutcome> {
  const booking = await db.booking.findUnique({
    where: { id: input.bookingId },
    select: { id: true, teacherId: true, status: true },
  });
  if (!booking) return { ok: false, reason: "not_found" };
  if (booking.teacherId !== input.teacherId) return { ok: false, reason: "not_teacher" };
  if (booking.status !== "pending_teacher_confirmation") {
    return { ok: false, reason: "not_pending" };
  }

  const declined = await db.booking.updateMany({
    where: { id: booking.id, status: "pending_teacher_confirmation" },
    data: {
      status: "cancelled",
      cancellationReason: input.reason,
      confirmationExpiresAt: null,
    },
  });
  if (declined.count === 0) return { ok: false, reason: "not_pending" };

  await notifyBookingCancelled(booking.id).catch((error) => {
    logger.warn("booking_decline_notification_failed", { bookingId: booking.id, error });
  });

  return { ok: true, bookingId: booking.id };
}

/**
 * Release the slots held by requests the teacher never answered.
 *
 * This matters more than it looks. Both `getAvailableSlots` and the double-booking conflict
 * check count a held booking as occupied, so an unanswered request that never expires removes
 * that hour from the teacher's calendar permanently — which is exactly what happened while the
 * scheduled jobs were undeployed.
 *
 * Candidates are selected in one query and cancelled in another, so a teacher may accept
 * between the two. Every transition is therefore conditional on the row still being pending;
 * without that, an accept could be overwritten by an expiry that had already read it.
 */
export async function expireUnansweredBookingRequests(now = new Date()): Promise<number> {
  const stale = await db.booking.findMany({
    where: {
      status: "pending_teacher_confirmation",
      confirmationExpiresAt: { lte: now },
    },
    select: { id: true },
    take: 100,
  });

  let expired = 0;
  for (const booking of stale) {
    const cancelled = await db.$transaction(async (tx) => {
      const result = await tx.booking.updateMany({
        where: {
          id: booking.id,
          status: "pending_teacher_confirmation",
          confirmationExpiresAt: { lte: now },
        },
        data: {
          status: "cancelled",
          cancellationReason: "The teacher did not respond in time",
          confirmationExpiresAt: null,
        },
      });
      return result.count > 0;
    });
    if (!cancelled) continue;

    expired += 1;
    await notifyBookingCancelled(booking.id).catch((error) => {
      logger.warn("booking_expiry_notification_failed", { bookingId: booking.id, error });
    });
  }

  return expired;
}
