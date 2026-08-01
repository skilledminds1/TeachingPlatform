import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/observability/logger";
import { constantTimeEqual } from "@/lib/security/compare";
import { verifyPayfastItnSignature } from "@/services/payfast/signature";
import { startPaymentGrace } from "@/server/billing/lifecycle";
import { nextPeriodEnd } from "@/server/billing/periods";


/** PayFast ITN — platform teacher subscriptions only (not student lesson payments). */
export async function POST(request: NextRequest) {
  if (!env.PAYFAST_MERCHANT_ID || !env.PAYFAST_PASSPHRASE) {
    return new NextResponse("PayFast is not configured", { status: 503 });
  }

  const rawBody = await request.text();
  const params = new URLSearchParams(rawBody);
  const receivedSignature = params.get("signature");

  if (
    !receivedSignature ||
    !verifyPayfastItnSignature({
      fields: params.entries(),
      received: receivedSignature,
      passphrase: env.PAYFAST_PASSPHRASE,
      compare: constantTimeEqual,
    }) ||
    !constantTimeEqual(params.get("merchant_id") ?? "", env.PAYFAST_MERCHANT_ID)
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

/**
 * SEC-15 — PayFast's integration guide lists four mandatory ITN checks: signature, valid
 * source, amount, and the server confirmation postback. Signature and server confirmation
 * were already done; this is the amount check.
 *
 * Checkout embeds the quoted USD cents in custom_str4, and the ZAR charged is derived from
 * it via PAYFAST_USD_ZAR_RATE. Both values arrive inside the PayFast-signed payload, so this
 * verifies they remain internally consistent: it catches FX misconfiguration and any
 * amount edited between checkout and settlement, rather than silently invoicing whatever
 * arrives.
 *
 * A tolerance is used because the configured rate can legitimately move between checkout and
 * the ITN. The exact check -- comparing against a quote persisted at checkout time -- belongs
 * with the subscription provider migration (P2), which replaces this handler entirely; adding
 * a quote table for a rail we are retiring would be throwaway work.
 */
const AMOUNT_TOLERANCE = 0.05;

function amountLooksConsistent(params: URLSearchParams): boolean {
  const grossZar = Number(params.get("amount_gross") ?? params.get("amount") ?? "0");
  const quotedUsdCents = Number(params.get("custom_str4") ?? "0");
  const rate = env.PAYFAST_USD_ZAR_RATE;

  if (!Number.isFinite(grossZar) || grossZar <= 0) return false;
  // Without a quote or a configured rate there is nothing to compare against; the signature
  // and server confirmation still stand, so do not reject a legitimate payment.
  if (!Number.isFinite(quotedUsdCents) || quotedUsdCents <= 0 || !rate) return true;

  const expectedZar = (quotedUsdCents / 100) * rate;
  return Math.abs(grossZar - expectedZar) <= expectedZar * AMOUNT_TOLERANCE;
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

  if (paymentStatus === "COMPLETE" && !amountLooksConsistent(params)) {
    logger.error("payfast_itn_amount_mismatch", {
      organizationId,
      planId,
      interval,
      providerEventId,
      amountGross: params.get("amount_gross"),
      quotedUsdCents: params.get("custom_str4"),
    });
    await db.billingEvent
      .create({
        data: {
          organizationId,
          providerEventId: `${providerEventId}:amount_mismatch`,
          eventType: "validation_failed",
          payload: Object.fromEntries(params),
        },
      })
      .catch(() => undefined);
    return new NextResponse("Amount mismatch", { status: 400 });
  }

  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      currentPeriodEnd: true,
      graceStartedAt: true,
      graceEndsAt: true,
      payfastToken: true,
      planId: true,
      billingInterval: true,
    },
  });
  if (!organization) {
    return new NextResponse("Billing account not found", { status: 404 });
  }

  // MON-12: PayFast echoes the ORIGINAL checkout's custom fields on every recurring charge
  // for the life of a subscription token. Plans are changed in place on the same token
  // (updatePayfastSubscription only alters amount and frequency at PayFast), so custom_str2
  // and custom_str3 stay frozen at whatever was bought first. Applying them on every ITN
  // meant a teacher who upgraded Starter -> Business was charged the Business amount at
  // renewal and then silently reverted to Starter; an interval change likewise left the org
  // extended by one month on an annual subscription.
  //
  // Treat the custom fields as authoritative only for the FIRST activation of a token.
  // Afterwards the organization's own record is the source of truth and the ITN just renews.
  const token = params.get("token");
  const isRenewalOfKnownToken =
    paymentStatus === "COMPLETE" &&
    Boolean(organization.payfastToken) &&
    Boolean(token) &&
    organization.payfastToken === token;

  const effectivePlanId = isRenewalOfKnownToken ? organization.planId : planId;
  const effectiveInterval = isRenewalOfKnownToken
    ? (organization.billingInterval as "monthly" | "annual")
    : interval;

  if (isRenewalOfKnownToken && (organization.planId !== planId || organization.billingInterval !== interval)) {
    logger.info("payfast_itn_stale_custom_fields_ignored", {
      organizationId,
      itnPlanId: planId,
      currentPlanId: organization.planId,
      itnInterval: interval,
      currentInterval: organization.billingInterval,
    });
  }

  const plan = await db.plan.findUnique({
    where: { id: effectivePlanId },
    select: { id: true, name: true },
  });
  if (!plan) {
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
        const periodEnd = nextPeriodEnd(organization.currentPeriodEnd, effectiveInterval);
        await tx.organization.update({
          where: { id: organizationId },
          data: {
            planId: effectivePlanId,
            billingInterval: effectiveInterval,
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
              // MON-24: PayFast settles in ZAR, so the amount charged really is rand — but
              // the currency was a hardcoded literal rather than a statement about the
              // gateway. Read it from the ITN so the invoice reflects what the payer was
              // actually billed, and so this does not silently lie if the rail changes.
              currency: params.get("currency")?.toUpperCase() || "ZAR",
              description: `Amazing Skills ${plan.name} subscription (${effectiveInterval})`,
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
        // The token is dead once PayFast reports the subscription cancelled (whether the
        // teacher cancelled on PayFast's side or PayFast cancelled after repeated failures).
        // Clearing it lets the lifecycle job's `!organization.payfastToken` short-circuit
        // apply the downgrade at period end. Keeping it meant the job tried to cancel an
        // already-cancelled subscription every night, failed every night, and left the
        // organization on a paid plan indefinitely while nothing was being charged.
        await tx.organization.update({
          where: { id: organizationId },
          data: {
            cancelAtPeriodEnd: true,
            payfastToken: null,
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
