import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { createPayfastSignature } from "@/services/payfast/signature";
import { startPaymentGrace } from "@/server/billing/lifecycle";

function nextPeriodEnd(current: Date | null, interval: "monthly" | "annual"): Date {
  const date = current && current > new Date() ? new Date(current) : new Date();
  if (interval === "annual") date.setUTCFullYear(date.getUTCFullYear() + 1);
  else date.setUTCMonth(date.getUTCMonth() + 1);
  return date;
}

/** PayFast ITN — platform teacher subscriptions only (not student lesson payments). */
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

  // Ignore any legacy lesson Split Payment ITNs — student payments use PayPal only.
  if (params.get("custom_str1") === "lesson") {
    return new NextResponse("OK");
  }

  return handleSubscriptionItn(params);
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
    select: { id: true, currentPeriodEnd: true, graceStartedAt: true, graceEndsAt: true },
  });
  const plan = await db.plan.findUnique({
    where: { id: planId },
    select: { id: true, name: true },
  });
  if (!organization || !plan) {
    return new NextResponse("Billing account not found", { status: 404 });
  }

  try {
    await db.$transaction(async (tx) => {
      const billingEvent = await tx.billingEvent.create({
        data: {
          organizationId,
          providerEventId,
          eventType: paymentStatus,
          payload: Object.fromEntries(params),
        },
        select: { id: true },
      });

      if (paymentStatus === "COMPLETE") {
        const periodStart = new Date();
        const periodEnd = nextPeriodEnd(organization.currentPeriodEnd, interval);
        await tx.organization.update({
          where: { id: organizationId },
          data: {
            planId,
            billingInterval: interval,
            subscriptionStatus: "active",
            payfastToken: params.get("token"),
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: false,
            trialEndsAt: null,
            graceStartedAt: null,
            graceEndsAt: null,
            dunningStage: 0,
            dunningLastNoticeAt: null,
            pendingPlanId: null,
            pendingBillingInterval: null,
            pendingChangeAt: null,
            complimentaryPlanId: null,
            complimentaryExpiresAt: null,
            complimentaryGrantedById: null,
            complimentaryGrantedAt: null,
            complimentaryPreviousPlanId: null,
            complimentaryNote: null,
          },
        });

        const amountGross = Number(params.get("amount_gross") ?? params.get("amount") ?? "0");
        if (Number.isFinite(amountGross) && amountGross > 0) {
          await tx.subscriptionInvoice.create({
            data: {
              organizationId,
              billingEventId: billingEvent.id,
              providerPaymentId: providerEventId,
              amountCents: Math.round(amountGross * 100),
              currency: "ZAR",
              description: `Amazing Skills ${plan.name} subscription (${interval})`,
              periodStart,
              periodEnd,
            },
          });
        }
      } else if (paymentStatus === "FAILED") {
        const grace =
          organization.graceStartedAt && organization.graceEndsAt
            ? {
                subscriptionStatus: "past_due" as const,
                graceStartedAt: organization.graceStartedAt,
                graceEndsAt: organization.graceEndsAt,
              }
            : startPaymentGrace();
        await tx.organization.update({
          where: { id: organizationId },
          data: grace,
        });
      } else if (paymentStatus === "CANCELLED") {
        await tx.organization.update({
          where: { id: organizationId },
          data: {
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
