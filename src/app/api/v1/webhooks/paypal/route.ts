import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { majorUnitsToCents } from "@/lib/payments/routing";
import {
  applyRefundToAttempt,
  confirmBookingPayment,
  confirmCoursePayment,
  markAttemptFailed,
} from "@/server/payments/confirm";
import { verifyPayPalWebhookSignature } from "@/services/paypal/checkout";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const valid = await verifyPayPalWebhookSignature({
    headers: request.headers,
    body,
  });
  if (!valid) {
    return new NextResponse("Invalid PayPal signature", { status: 400 });
  }

  const event = JSON.parse(body) as {
    id: string;
    event_type: string;
    resource?: {
      id?: string;
      status?: string;
      amount?: { value?: string; currency_code?: string };
      custom_id?: string;
      supplementary_data?: {
        related_ids?: { order_id?: string };
      };
      purchase_units?: Array<{
        reference_id?: string;
        custom_id?: string;
        amount?: { value?: string; currency_code?: string };
        payee?: { merchant_id?: string };
        payments?: {
          captures?: Array<{
            id: string;
            amount?: { value: string; currency_code: string };
          }>;
        };
      }>;
    };
  };

  if (event.event_type === "CHECKOUT.ORDER.APPROVED" || event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
    const unit = event.resource?.purchase_units?.[0];
    const capture =
      event.resource?.id && event.event_type === "PAYMENT.CAPTURE.COMPLETED"
        ? {
            id: event.resource.id,
            amount: event.resource.amount,
          }
        : unit?.payments?.captures?.[0];
    const attemptId = unit?.reference_id;
    const teacherMerchantId = unit?.payee?.merchant_id;
    const amount = capture?.amount?.value ?? unit?.amount?.value;
    const currency = capture?.amount?.currency_code ?? unit?.amount?.currency_code;

    if (attemptId && teacherMerchantId && amount && currency && capture?.id) {
      const attempt = await db.paymentAttempt.findUnique({
        where: { id: attemptId },
        select: { bookingId: true, coursePurchaseId: true },
      });
      const confirmation = {
        attemptId,
        providerPaymentId: capture.id,
        providerEventId: event.id,
        eventType: event.event_type,
        payload: event as object,
        amountCents: majorUnitsToCents(amount),
        currency,
        teacherMerchantId,
      };
      if (attempt?.bookingId) {
        await confirmBookingPayment(confirmation);
      } else if (attempt?.coursePurchaseId) {
        await confirmCoursePayment(confirmation);
      }
    }
  }

  if (event.event_type === "PAYMENT.CAPTURE.DENIED" || event.event_type === "CHECKOUT.ORDER.VOIDED") {
    const attemptId = event.resource?.purchase_units?.[0]?.reference_id;
    if (attemptId) {
      await markAttemptFailed({
        attemptId,
        providerEventId: event.id,
        eventType: event.event_type,
        payload: event as object,
        failureCode: event.event_type,
      });
    }
  }

  if (event.event_type === "PAYMENT.CAPTURE.REFUNDED") {
    const orderId = event.resource?.supplementary_data?.related_ids?.order_id;
    const amount = event.resource?.amount?.value;
    if (orderId && amount) {
      const attempt = await db.paymentAttempt.findFirst({
        where: { provider: "paypal", providerCheckoutId: orderId },
      });
      if (attempt) {
        await applyRefundToAttempt({
          attemptId: attempt.id,
          providerEventId: event.id,
          eventType: event.event_type,
          payload: event as object,
          refundedCents: majorUnitsToCents(amount),
        });
      }
    }
  }

  return new NextResponse("OK");
}
