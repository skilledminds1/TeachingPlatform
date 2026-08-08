import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { isLessonProviderEnabled } from "@/lib/payments/provider-flags";
import { providerAmountToMinorUnits } from "@/lib/payments/routing";
import {
  applyRefundToAttempt,
  confirmBookingPayment,
  markAttemptFailed,
} from "@/server/payments/confirm";
import { notifyPaymentDispute } from "@/server/notifications/notify";
import { verifyPayPalWebhookSignature } from "@/services/paypal/checkout";

export async function POST(request: NextRequest) {
  // Gated alongside PayPal linking (SEC-02). No PaymentAttempt can exist while the flag is
  // off, so this handler has nothing legitimate to act on.
  //
  // KNOWN DEFECTS TO FIX BEFORE EVER SETTING LESSON_PAYMENTS_PAYPAL_ENABLED=true — these are
  // deliberately left in place rather than repaired, because the Stripe rail replaces this
  // path entirely and fixing a handler we intend to delete is throwaway work:
  //
  //  MON-04: the confirm and deny branches below read `resource.purchase_units[0]`, but
  //    PAYMENT.CAPTURE.COMPLETED and PAYMENT.CAPTURE.DENIED deliver a *capture* resource,
  //    which has no purchase_units — it carries custom_id and
  //    supplementary_data.related_ids.order_id instead. Both branches therefore never fire.
  //    CHECKOUT.ORDER.APPROVED does carry purchase_units but has no capture yet, so it is
  //    skipped too. Resolve the attempt the way the REFUNDED branch already does.
  //  MON-05: nothing here captures an approved order, so the authenticated browser redirect
  //    is the only path that completes a payment. An abandoned tab loses the sale.
  //  MON-06: parsePayPalOrder drops the capture's own status, and an order reads COMPLETED
  //    as soon as a capture exists — including a PENDING one. Require capture status
  //    COMPLETED before granting access.
  if (!isLessonProviderEnabled("paypal")) {
    return new NextResponse("Not found", { status: 404 });
  }

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
      dispute_amount?: { value?: string; currency_code?: string };
      reason?: string;
      disputed_transactions?: Array<{
        seller_transaction_id?: string;
      }>;
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
        select: { bookingId: true },
      });
      const confirmation = {
        attemptId,
        providerPaymentId: capture.id,
        providerEventId: event.id,
        eventType: event.event_type,
        payload: event as object,
        // INT-09: parsed against the event's own currency, not assumed to be two-decimal.
        amountCents: providerAmountToMinorUnits(amount, currency),
        currency,
        teacherMerchantId,
      };
      if (attempt?.bookingId) {
        await confirmBookingPayment(confirmation);
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
    // INT-09: the currency is now required to read the amount at all. Without it there is
    // no exponent, and a refund recorded against the wrong exponent misstates the ledger.
    const refundCurrency = event.resource?.amount?.currency_code;
    if (orderId && amount && refundCurrency) {
      const attempt = await db.paymentAttempt.findFirst({
        where: { provider: "paypal", providerCheckoutId: orderId },
      });
      if (attempt) {
        await applyRefundToAttempt({
          attemptId: attempt.id,
          providerEventId: event.id,
          providerRefundId: event.resource?.id,
          eventType: event.event_type,
          payload: event as object,
          refundedCents: providerAmountToMinorUnits(amount, refundCurrency),
        });
      }
    }
  }

  if (event.event_type.startsWith("CUSTOMER.DISPUTE.")) {
    const providerCaseId = event.resource?.id;
    const captureId = event.resource?.disputed_transactions?.[0]?.seller_transaction_id;
    if (providerCaseId && captureId) {
      const attempt = await db.paymentAttempt.findFirst({
        where: { provider: "paypal", providerPaymentId: captureId },
        select: { id: true },
      });
      if (attempt) {
        const resolved = event.event_type === "CUSTOMER.DISPUTE.RESOLVED";
        await db.paymentDispute.upsert({
          where: { providerCaseId },
          create: {
            paymentAttemptId: attempt.id,
            providerCaseId,
            status: resolved ? "closed" : "open",
            reason: event.resource?.reason,
            amountCents:
              event.resource?.dispute_amount?.value &&
              event.resource.dispute_amount.currency_code
                ? providerAmountToMinorUnits(
                    event.resource.dispute_amount.value,
                    event.resource.dispute_amount.currency_code,
                  )
                : null,
            currency: event.resource?.dispute_amount?.currency_code,
            payload: event as object,
            resolvedAt: resolved ? new Date() : null,
          },
          update: {
            status: resolved ? "closed" : "under_review",
            reason: event.resource?.reason,
            payload: event as object,
            resolvedAt: resolved ? new Date() : null,
          },
        });
        await notifyPaymentDispute(attempt.id, providerCaseId, event.id).catch(() => undefined);
      }
    }
  }

  return new NextResponse("OK");
}
