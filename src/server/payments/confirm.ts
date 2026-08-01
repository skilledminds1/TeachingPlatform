import { randomUUID } from "node:crypto";

import type { PaymentAttempt, PaymentProvider, Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/observability/logger";
import { ensureVideoSessionForBooking } from "@/server/video/sessions";
import {
  notifyBookingConfirmed,
  notifyCoursePurchased,
  notifyPaymentFailed,
} from "@/server/notifications/notify";

type Tx = Prisma.TransactionClient;

export async function recordPaymentEvent(input: {
  provider: PaymentProvider;
  providerEventId: string;
  eventType: string;
  payload: Prisma.InputJsonValue;
  paymentAttemptId?: string | null;
  tx?: Tx;
}): Promise<{ created: boolean }> {
  const client = input.tx ?? db;
  try {
    await client.paymentEvent.create({
      data: {
        id: randomUUID(),
        provider: input.provider,
        providerEventId: input.providerEventId,
        eventType: input.eventType,
        payload: input.payload,
        paymentAttemptId: input.paymentAttemptId ?? null,
      },
    });
    return { created: true };
  } catch (error) {
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return { created: false };
    }
    throw error;
  }
}

export async function confirmBookingPayment(input: {
  attemptId: string;
  providerPaymentId: string;
  providerEventId: string;
  eventType: string;
  payload: Prisma.InputJsonValue;
  amountCents: number;
  currency: string;
  teacherMerchantId: string;
}): Promise<{ confirmed: boolean; bookingId?: string }> {
  return db.$transaction(async (tx) => {
    const attempt = await tx.paymentAttempt.findUnique({
      where: { id: input.attemptId },
      include: { booking: true },
    });
    if (!attempt || !attempt.bookingId || !attempt.booking) {
      return { confirmed: false };
    }
    const bookingId = attempt.bookingId;

    if (
      attempt.amountCents !== input.amountCents ||
      attempt.currency.toUpperCase() !== input.currency.toUpperCase() ||
      attempt.teacherMerchantId !== input.teacherMerchantId
    ) {
      await recordPaymentEvent({
        tx,
        provider: attempt.provider,
        providerEventId: `${input.providerEventId}:mismatch`,
        eventType: "validation_failed",
        payload: input.payload,
        paymentAttemptId: attempt.id,
      });
      return { confirmed: false };
    }

    const event = await recordPaymentEvent({
      tx,
      provider: attempt.provider,
      providerEventId: input.providerEventId,
      eventType: input.eventType,
      payload: input.payload,
      paymentAttemptId: attempt.id,
    });
    if (!event.created && attempt.status === "succeeded") {
      return { confirmed: true, bookingId };
    }

    if (attempt.status === "succeeded" && attempt.booking.status === "confirmed") {
      return { confirmed: true, bookingId };
    }

    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "succeeded",
        providerPaymentId: input.providerPaymentId,
        succeededAt: new Date(),
        failureCode: null,
        failureMessage: null,
      },
    });

    await tx.paymentAttempt.updateMany({
      where: {
        bookingId,
        id: { not: attempt.id },
        status: { in: ["pending", "requires_action"] },
      },
      data: { status: "expired" },
    });

    // Only a booking still awaiting payment may be confirmed. Previously this update was
    // unconditional, so a payment landing after the 30-minute hold expired (or after either
    // party cancelled) flipped the booking from `cancelled` back to `confirmed` — and since
    // the slot had already been released, a second student could have booked and paid for
    // the same time. That produced two confirmed, paid bookings for one slot, with no way
    // to refund from the platform because it never holds the funds.
    const revived = await tx.booking.updateMany({
      where: { id: bookingId, status: "pending_payment" },
      data: {
        status: "confirmed",
        paymentProvider: attempt.provider,
        paymentExternalId: input.providerPaymentId,
        paymentExpiresAt: null,
      },
    });

    if (revived.count === 0) {
      // Money was taken for a booking that is no longer live. Flag it for a refund rather
      // than silently keeping the payment or resurrecting the lesson.
      await recordPaymentEvent({
        tx,
        provider: attempt.provider,
        providerEventId: `${input.providerEventId}:orphaned`,
        eventType: "paid_after_booking_closed",
        payload: input.payload,
        paymentAttemptId: attempt.id,
      });
      await tx.refundRequest.createMany({
        data: [
          {
            paymentAttemptId: attempt.id,
            bookingId,
            studentId: attempt.booking.studentId,
            teacherId: attempt.booking.teacherId,
            requestedAmountCents: attempt.amountCents,
            currency: attempt.currency,
            reason:
              "Payment completed after the lesson was cancelled or the payment window closed.",
            policyEligible: true,
            status: "escalated",
            escalatedAt: new Date(),
          },
        ],
        skipDuplicates: true,
      });
      logger.error("payment_confirmed_for_closed_booking", {
        bookingId,
        attemptId: attempt.id,
        bookingStatus: attempt.booking.status,
      });
      return { confirmed: false, bookingId };
    }

    return { confirmed: true, bookingId };
  }).then(async (result) => {
    if (result.confirmed && result.bookingId) {
      await ensureVideoSessionForBooking(result.bookingId);
      await notifyBookingConfirmed(result.bookingId).catch((error) => {
        logger.warn("booking_confirmation_notification_failed", {
          error,
          bookingId: result.bookingId,
        });
      });
      const { syncBookingToConnectedCalendars } = await import(
        "@/server/integrations/google-calendar"
      );
      await syncBookingToConnectedCalendars(result.bookingId).catch((error) => {
        logger.warn("booking_calendar_sync_failed", { error, bookingId: result.bookingId });
      });
    }
    return result;
  });
}

export async function confirmCoursePayment(input: {
  attemptId: string;
  providerPaymentId: string;
  providerEventId: string;
  eventType: string;
  payload: Prisma.InputJsonValue;
  amountCents: number;
  currency: string;
  teacherMerchantId: string;
}): Promise<{ confirmed: boolean; coursePurchaseId?: string }> {
  return db.$transaction(async (tx) => {
    const attempt = await tx.paymentAttempt.findUnique({
      where: { id: input.attemptId },
      include: { coursePurchase: true },
    });
    if (!attempt || !attempt.coursePurchaseId || !attempt.coursePurchase) {
      return { confirmed: false };
    }
    const purchase = attempt.coursePurchase;

    if (
      attempt.amountCents !== input.amountCents ||
      purchase.amountCents !== input.amountCents ||
      attempt.currency.toUpperCase() !== input.currency.toUpperCase() ||
      purchase.currency.toUpperCase() !== input.currency.toUpperCase() ||
      attempt.teacherMerchantId !== input.teacherMerchantId
    ) {
      await recordPaymentEvent({
        tx,
        provider: attempt.provider,
        providerEventId: `${input.providerEventId}:mismatch`,
        eventType: "validation_failed",
        payload: input.payload,
        paymentAttemptId: attempt.id,
      });
      return { confirmed: false };
    }

    const event = await recordPaymentEvent({
      tx,
      provider: attempt.provider,
      providerEventId: input.providerEventId,
      eventType: input.eventType,
      payload: input.payload,
      paymentAttemptId: attempt.id,
    });
    if (!event.created && attempt.status === "succeeded") {
      return { confirmed: true, coursePurchaseId: purchase.id };
    }
    if (attempt.status === "succeeded" && purchase.status === "succeeded") {
      return { confirmed: true, coursePurchaseId: purchase.id };
    }

    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "succeeded",
        providerPaymentId: input.providerPaymentId,
        succeededAt: new Date(),
        failureCode: null,
        failureMessage: null,
      },
    });
    await tx.paymentAttempt.updateMany({
      where: {
        coursePurchaseId: purchase.id,
        id: { not: attempt.id },
        status: { in: ["pending", "requires_action"] },
      },
      data: { status: "expired" },
    });
    // As with bookings, only a purchase still awaiting payment may be completed — an
    // unconditional update silently revived cancelled or refunded purchases and re-granted
    // course access.
    const completed = await tx.coursePurchase.updateMany({
      where: { id: purchase.id, status: "pending" },
      data: {
        status: "succeeded",
        paymentProvider: attempt.provider,
        paymentExternalId: input.providerPaymentId,
        paymentExpiresAt: null,
      },
    });

    if (completed.count === 0) {
      await recordPaymentEvent({
        tx,
        provider: attempt.provider,
        providerEventId: `${input.providerEventId}:orphaned`,
        eventType: "paid_after_purchase_closed",
        payload: input.payload,
        paymentAttemptId: attempt.id,
      });
      logger.error("payment_confirmed_for_closed_purchase", {
        coursePurchaseId: purchase.id,
        attemptId: attempt.id,
        purchaseStatus: purchase.status,
      });
      return { confirmed: false, coursePurchaseId: purchase.id };
    }
    if (purchase.courseCouponId) {
      // MON-26: the redemption is now reserved when checkout starts, so the limit accounts
      // for in-flight purchases. This remains as a backstop for purchases created before
      // that change (and for the free/100%-off path), hence skipDuplicates.
      await tx.courseCouponRedemption.createMany({
        data: [
          {
            couponId: purchase.courseCouponId,
            purchaseId: purchase.id,
            studentId: purchase.studentId,
          },
        ],
        skipDuplicates: true,
      });
    }
    await tx.courseEnrollment.upsert({
      where: {
        courseId_studentId: {
          courseId: purchase.courseId,
          studentId: purchase.studentId,
        },
      },
      create: {
        courseId: purchase.courseId,
        studentId: purchase.studentId,
        purchaseId: purchase.id,
      },
      update: {
        purchaseId: purchase.id,
        revokedAt: null,
        enrolledAt: new Date(),
      },
    });

    return { confirmed: true, coursePurchaseId: purchase.id };
  }).then(async (result) => {
    if (result.confirmed && result.coursePurchaseId) {
      await notifyCoursePurchased(result.coursePurchaseId).catch((error) => {
        logger.warn("course_purchase_notification_failed", {
          error,
          coursePurchaseId: result.coursePurchaseId,
        });
      });
    }
    return result;
  });
}

export async function markAttemptFailed(input: {
  attemptId: string;
  providerEventId: string;
  eventType: string;
  payload: Prisma.InputJsonValue;
  failureCode?: string;
  failureMessage?: string;
}): Promise<void> {
  await db.$transaction(async (tx) => {
    const attempt = await tx.paymentAttempt.findUnique({ where: { id: input.attemptId } });
    if (!attempt || attempt.status === "succeeded") return;

    await recordPaymentEvent({
      tx,
      provider: attempt.provider,
      providerEventId: input.providerEventId,
      eventType: input.eventType,
      payload: input.payload,
      paymentAttemptId: attempt.id,
    });

    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "failed",
        failureCode: input.failureCode ?? null,
        failureMessage: input.failureMessage ?? null,
      },
    });
  });
  await notifyPaymentFailed(input.attemptId).catch((error) => {
    logger.warn("payment_failure_notification_failed", { error, attemptId: input.attemptId });
  });
}

export async function applyRefundToAttempt(input: {
  attemptId: string;
  providerEventId: string;
  providerRefundId?: string;
  eventType: string;
  payload: Prisma.InputJsonValue;
  refundedCents: number;
}): Promise<void> {
  await db.$transaction(async (tx) => {
    const attempt = await tx.paymentAttempt.findUnique({ where: { id: input.attemptId } });
    if (!attempt) return;

    const event = await recordPaymentEvent({
      tx,
      provider: attempt.provider,
      providerEventId: input.providerEventId,
      eventType: input.eventType,
      payload: input.payload,
      paymentAttemptId: attempt.id,
    });
    if (!event.created) return;

    const refundedCents = Math.min(
      attempt.amountCents,
      Math.max(attempt.refundedCents, input.refundedCents),
    );
    const status =
      refundedCents >= attempt.amountCents ? "refunded" : "partially_refunded";

    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: { refundedCents, status },
    });
    await tx.refundRequest.updateMany({
      where: {
        paymentAttemptId: attempt.id,
        status: { in: ["requested", "teacher_approved", "teacher_declined", "escalated"] },
      },
      data: {
        status: refundedCents >= attempt.amountCents ? "refunded" : "teacher_approved",
        providerRefundId: input.providerRefundId ?? input.providerEventId,
        providerRefundedCents: refundedCents,
        resolvedAt: refundedCents >= attempt.amountCents ? new Date() : null,
      },
    });
    await applyRefundEffects(tx, {
      coursePurchaseId: attempt.coursePurchaseId,
      fullyRefunded: status === "refunded",
    });
  });
}

/**
 * Apply the downstream consequences of a refund: revoke course access and any certificate
 * issued off the back of it.
 *
 * MON-09: this used to live only inside the provider-webhook path, so a refund the teacher
 * made outside the platform — an EFT, or a refund issued from their own provider dashboard —
 * left the student fully enrolled with the purchase still reading "succeeded". That is the
 * wrong way round for this product: the platform never holds funds, so refunds handled
 * directly between teacher and student are the EXPECTED route, not the exception. Shared by
 * both paths so they cannot diverge again.
 */
export async function applyRefundEffects(
  tx: Tx,
  input: { coursePurchaseId: string | null; fullyRefunded: boolean },
): Promise<void> {
  if (!input.fullyRefunded || !input.coursePurchaseId) return;

  const now = new Date();
  await tx.coursePurchase.updateMany({
    where: { id: input.coursePurchaseId },
    data: { status: "refunded", paymentExpiresAt: null },
  });
  await tx.courseEnrollment.updateMany({
    where: { purchaseId: input.coursePurchaseId, revokedAt: null },
    data: { revokedAt: now },
  });

  // MON-35: a certificate outlived the enrollment it was earned through, so the public
  // verification page kept vouching for a student whose purchase had been refunded.
  const enrollments = await tx.courseEnrollment.findMany({
    where: { purchaseId: input.coursePurchaseId },
    select: { courseId: true, studentId: true },
  });
  for (const enrollment of enrollments) {
    await tx.courseCertificate.updateMany({
      where: {
        courseId: enrollment.courseId,
        studentId: enrollment.studentId,
        revokedAt: null,
      },
      data: { revokedAt: now, revocationReason: "Purchase refunded" },
    });
  }
}

export async function expireAbandonedPayments(now = new Date()): Promise<number> {
  const [expiredBookings, expiredCoursePurchases] = await Promise.all([
    db.booking.findMany({
      where: {
        status: "pending_payment",
        paymentExpiresAt: { lte: now },
      },
      select: { id: true },
      take: 100,
    }),
    db.coursePurchase.findMany({
      where: {
        status: "pending",
        paymentExpiresAt: { lte: now },
      },
      select: { id: true },
      take: 100,
    }),
  ]);

  // The candidate rows were selected in a separate query, so a payment may confirm between
  // the SELECT and this UPDATE — exactly the case when a payment races the deadline. Every
  // transition below is therefore conditional on the row still being unpaid; without that,
  // a confirmed, paid booking could be flipped to "cancelled — payment window expired"
  // while its succeeded PaymentAttempt survived, leaving money captured and no lesson.
  let expired = 0;

  for (const booking of expiredBookings) {
    await db.$transaction(async (tx) => {
      const cancelled = await tx.booking.updateMany({
        where: { id: booking.id, status: "pending_payment", paymentExpiresAt: { lte: now } },
        data: {
          status: "cancelled",
          cancellationReason: "Payment window expired",
          paymentExpiresAt: null,
        },
      });
      if (cancelled.count === 0) return;

      await tx.paymentAttempt.updateMany({
        where: {
          bookingId: booking.id,
          status: { in: ["pending", "requires_action"] },
        },
        data: { status: "expired" },
      });
      expired += 1;
    });
  }

  for (const purchase of expiredCoursePurchases) {
    await db.$transaction(async (tx) => {
      const cancelled = await tx.coursePurchase.updateMany({
        where: { id: purchase.id, status: "pending", paymentExpiresAt: { lte: now } },
        data: { status: "cancelled", paymentExpiresAt: null },
      });
      if (cancelled.count === 0) return;

      await tx.paymentAttempt.updateMany({
        where: {
          coursePurchaseId: purchase.id,
          status: { in: ["pending", "requires_action"] },
        },
        data: { status: "expired" },
      });
      await tx.courseCouponRedemption.deleteMany({
        where: { purchaseId: purchase.id },
      });
      expired += 1;
    });
  }

  return expired;
}

export function paymentWindowExpiry(from = new Date()): Date {
  return new Date(from.getTime() + env.LESSON_PAYMENT_TIMEOUT_MINUTES * 60_000);
}

export type { PaymentAttempt };
