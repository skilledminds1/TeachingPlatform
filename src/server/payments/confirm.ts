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

    await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: "confirmed",
        paymentProvider: attempt.provider,
        paymentExternalId: input.providerPaymentId,
        paymentExpiresAt: null,
      },
    });

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
    await tx.coursePurchase.update({
      where: { id: purchase.id },
      data: {
        status: "succeeded",
        paymentProvider: attempt.provider,
        paymentExternalId: input.providerPaymentId,
        paymentExpiresAt: null,
      },
    });
    if (purchase.courseCouponId) {
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
    if (status === "refunded" && attempt.coursePurchaseId) {
      await tx.coursePurchase.updateMany({
        where: { id: attempt.coursePurchaseId },
        data: { status: "refunded", paymentExpiresAt: null },
      });
      await tx.courseEnrollment.updateMany({
        where: { purchaseId: attempt.coursePurchaseId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  });
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

  for (const booking of expiredBookings) {
    await db.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: "cancelled",
          cancellationReason: "Payment window expired",
          paymentExpiresAt: null,
        },
      });
      await tx.paymentAttempt.updateMany({
        where: {
          bookingId: booking.id,
          status: { in: ["pending", "requires_action"] },
        },
        data: { status: "expired" },
      });
    });
  }

  for (const purchase of expiredCoursePurchases) {
    await db.$transaction(async (tx) => {
      await tx.coursePurchase.update({
        where: { id: purchase.id },
        data: { status: "cancelled", paymentExpiresAt: null },
      });
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
    });
  }

  return expiredBookings.length + expiredCoursePurchases.length;
}

export function paymentWindowExpiry(from = new Date()): Date {
  return new Date(from.getTime() + env.LESSON_PAYMENT_TIMEOUT_MINUTES * 60_000);
}

export type { PaymentAttempt };
