import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { majorUnitsToCents } from "@/lib/payments/routing";
import {
  confirmBookingPayment,
  markAttemptFailed,
} from "@/server/payments/confirm";
import { createPayfastSignature } from "@/services/payfast/signature";

function nextPeriodEnd(current: Date | null, interval: "monthly" | "annual"): Date {
  const date = current && current > new Date() ? new Date(current) : new Date();
  if (interval === "annual") date.setUTCFullYear(date.getUTCFullYear() + 1);
  else date.setUTCMonth(date.getUTCMonth() + 1);
  return date;
}

export async function POST(request: NextRequest) {
  if (!env.PAYFAST_MERCHANT_ID || !env.PAYFAST_PASSPHRASE) {
    return new NextResponse("PayFast is not configured", { status: 503 });
  }

  const rawBody = await request.text();
  const params = new URLSearchParams(rawBody);
  const receivedSignature = params.get("signature");
  const expectedSignature = createPayfastSignature(
    params.entries(),
    env.PAYFAST_PASSPHRASE,
  );

  if (
    !receivedSignature ||
    receivedSignature !== expectedSignature ||
    params.get("merchant_id") !== env.PAYFAST_MERCHANT_ID
  ) {
    return new NextResponse("Invalid signature", { status: 400 });
  }

  const validationUrl =
    env.PAYFAST_SANDBOX === "true"
      ? "https://sandbox.payfast.co.za/eng/query/validate"
      : "https://www.payfast.co.za/eng/query/validate";
  const validation = await fetch(validationUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: rawBody,
    cache: "no-store",
  });
  if (!validation.ok || (await validation.text()).trim() !== "VALID") {
    return new NextResponse("PayFast validation failed", { status: 400 });
  }

  const lessonFlag = params.get("custom_str1");
  if (lessonFlag === "lesson") {
    return handleLessonItn(params);
  }

  return handleSubscriptionItn(params);
}

async function handleLessonItn(params: URLSearchParams) {
  const attemptId = params.get("custom_str2") || params.get("m_payment_id");
  const bookingId = params.get("custom_str3");
  const teacherMerchantId = params.get("custom_str4");
  const providerEventId = params.get("pf_payment_id");
  const paymentStatus = params.get("payment_status");
  const amount = params.get("amount_gross") || params.get("amount");

  if (!attemptId || !bookingId || !teacherMerchantId || !providerEventId || !paymentStatus || !amount) {
    return new NextResponse("Missing lesson payment metadata", { status: 400 });
  }

  const attempt = await db.paymentAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt || attempt.bookingId !== bookingId) {
    return new NextResponse("Payment attempt not found", { status: 404 });
  }

  const payload = Object.fromEntries(params);

  if (paymentStatus === "COMPLETE") {
    await confirmBookingPayment({
      attemptId,
      providerPaymentId: providerEventId,
      providerEventId: `payfast:${providerEventId}`,
      eventType: paymentStatus,
      payload,
      amountCents: majorUnitsToCents(amount),
      currency: "ZAR",
      teacherMerchantId,
    });
  } else {
    await markAttemptFailed({
      attemptId,
      providerEventId: `payfast:${providerEventId}:${paymentStatus}`,
      eventType: paymentStatus,
      payload,
      failureCode: paymentStatus,
      failureMessage: `PayFast status ${paymentStatus}`,
    });
  }

  return new NextResponse("OK");
}

async function handleSubscriptionItn(params: URLSearchParams) {
  const organizationId = params.get("custom_str1");
  const planId = params.get("custom_str2");
  const interval = params.get("custom_str3");
  const providerEventId = params.get("pf_payment_id");
  const paymentStatus = params.get("payment_status");
  if (
    !organizationId ||
    !planId ||
    !providerEventId ||
    (interval !== "monthly" && interval !== "annual") ||
    !paymentStatus
  ) {
    return new NextResponse("Missing billing metadata", { status: 400 });
  }

  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, currentPeriodEnd: true },
  });
  const plan = await db.plan.findUnique({
    where: { id: planId },
    select: { id: true },
  });
  if (!organization || !plan) {
    return new NextResponse("Billing account not found", { status: 404 });
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.billingEvent.create({
        data: {
          organizationId,
          providerEventId,
          eventType: paymentStatus,
          payload: Object.fromEntries(params),
        },
      });

      if (paymentStatus === "COMPLETE") {
        await tx.organization.update({
          where: { id: organizationId },
          data: {
            planId,
            billingInterval: interval,
            subscriptionStatus: "active",
            payfastToken: params.get("token"),
            currentPeriodEnd: nextPeriodEnd(organization.currentPeriodEnd, interval),
            cancelAtPeriodEnd: false,
          },
        });
      } else if (paymentStatus === "FAILED") {
        await tx.organization.update({
          where: { id: organizationId },
          data: { subscriptionStatus: "past_due" },
        });
      } else if (paymentStatus === "CANCELLED") {
        await tx.organization.update({
          where: { id: organizationId },
          data: {
            subscriptionStatus: "cancelled",
            cancelAtPeriodEnd: true,
          },
        });
      }
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return new NextResponse("OK");
    }
    throw error;
  }

  return new NextResponse("OK");
}
