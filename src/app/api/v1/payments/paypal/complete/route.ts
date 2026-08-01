import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { isLessonProviderEnabled } from "@/lib/payments/provider-flags";
import { majorUnitsToCents } from "@/lib/payments/routing";
import { requireAuth } from "@/server/auth/session";
import {
  confirmBookingPayment,
  confirmCoursePayment,
} from "@/server/payments/confirm";
import {
  capturePayPalOrder,
  getPayPalOrder,
} from "@/services/paypal/checkout";

function paymentRedirect(request: NextRequest, path: string, status: string): NextResponse {
  const url = new URL(path, request.url);
  url.searchParams.set("payment", status);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  // Gated alongside PayPal linking (SEC-02) — no attempt can exist while the flag is off.
  //
  // KNOWN DEFECT TO FIX BEFORE ENABLING (MON-01): the only state check before capturing is
  // `attempt.status === "succeeded"`. Attempts that are expired or failed fall straight
  // through to capture, and neither attempt.expiresAt nor the parent booking/purchase status
  // is consulted. Two ways that takes money it should not: a student who opened checkout
  // twice can approve both orders and be charged twice for one lesson (startLessonCheckout
  // mints a fresh attempt and order per minute, and siblings are only marked expired in the
  // database, never voided at PayPal); and after the payment window closes or either party
  // cancels, a stale approve URL still captures. Require pending/requires_action, an unexpired
  // attempt, and a live parent before calling capturePayPalOrder.
  if (!isLessonProviderEnabled("paypal")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const user = await requireAuth();
  const orderId = request.nextUrl.searchParams.get("token");
  if (!orderId) {
    return NextResponse.redirect(new URL("/dashboard?payment=invalid", request.url));
  }

  const attempt = await db.paymentAttempt.findFirst({
    where: {
      provider: "paypal",
      providerCheckoutId: orderId,
    },
    select: {
      id: true,
      status: true,
      booking: { select: { id: true, studentId: true } },
      coursePurchase: { select: { id: true, studentId: true } },
    },
  });

  const targetPath = attempt?.booking
    ? `/dashboard/bookings/${attempt.booking.id}`
    : attempt?.coursePurchase
      ? `/dashboard/courses/purchases/${attempt.coursePurchase.id}`
      : null;
  const ownerId = attempt?.booking?.studentId ?? attempt?.coursePurchase?.studentId;

  if (!attempt || !targetPath || ownerId !== user.id) {
    return NextResponse.redirect(new URL("/dashboard?payment=invalid", request.url));
  }
  if (attempt.status === "succeeded") {
    return paymentRedirect(request, targetPath, "confirmed");
  }

  try {
    const existing = await getPayPalOrder(orderId);
    const order = existing.status === "APPROVED"
      ? await capturePayPalOrder(orderId)
      : existing;

    if (
      order.status !== "COMPLETED" ||
      !order.captureId ||
      !order.amount ||
      !order.currency ||
      !order.payeeMerchantId ||
      order.referenceId !== attempt.id
    ) {
      return paymentRedirect(request, targetPath, "pending");
    }

    const confirmation = {
      attemptId: attempt.id,
      providerPaymentId: order.captureId,
      providerEventId: `paypal-return:${orderId}:${order.captureId}`,
      eventType: "CHECKOUT.ORDER.CAPTURED_ON_RETURN",
      payload: {
        orderId,
        status: order.status,
        captureId: order.captureId,
        referenceId: order.referenceId,
      },
      amountCents: majorUnitsToCents(order.amount),
      currency: order.currency,
      teacherMerchantId: order.payeeMerchantId,
    };

    const result = attempt.booking
      ? await confirmBookingPayment(confirmation)
      : await confirmCoursePayment(confirmation);

    return paymentRedirect(
      request,
      targetPath,
      result.confirmed ? "confirmed" : "pending",
    );
  } catch {
    return paymentRedirect(request, targetPath, "error");
  }
}
