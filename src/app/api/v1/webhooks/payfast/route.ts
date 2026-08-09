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

  // Ignore any legacy lesson Split Payment ITNs. PayFast is the SUBSCRIPTION rail only;
  // students pay teachers on the teacher's own provider and none of it passes through here.
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
 * Checkout embeds the exact minor units quoted in custom_str4, and PayFast settles in the
 * same currency the plan is priced in, so this is now an equality test. It used to compare
 * the gross against a figure reconstructed by multiplying custom_str4 by
 * PAYFAST_USD_ZAR_RATE, which needed a 5% tolerance to absorb rate drift — and editing that
 * env var by more than 5% made this return 400 on a legitimate renewal PayFast had already
 * charged, writing no invoice while the lifecycle went on to dun a teacher who had paid.
 *
 * Both values arrive inside the PayFast-signed payload, so an amount edited between checkout
 * and settlement still fails here.
 */
function amountLooksConsistent(params: URLSearchParams): boolean {
  const gross = Number(params.get("amount_gross") ?? params.get("amount") ?? "0");
  const quotedCents = Number(params.get("custom_str4") ?? "0");

  if (!Number.isFinite(gross) || gross <= 0) return false;
  // A payment with no quote predates this field. The signature and the server confirmation
  // still stand, so do not reject a legitimate payment over a missing annotation.
  if (!Number.isFinite(quotedCents) || quotedCents <= 0) return true;

  /**
   * The quote is in RAND, because that is the only currency this checkout ever asks for. With
   * Multi-Currency Pricing the buyer may choose to pay in theirs, and there is then no honest
   * comparison to make here: reconstructing the expected foreign amount needs Payfast's rate
   * at the moment of capture, which is exactly the hand-maintained-constant trap that pricing
   * in ZAR was meant to delete (see 20260808160000_price_plans_in_zar).
   *
   * Getting this wrong is not a near miss. A strict comparison against a foreign gross fails,
   * the handler 400s a payment Payfast has ALREADY taken, no invoice is written, and the
   * lifecycle job then duns a teacher who paid — defect 2 of that migration, re-entering
   * through the multi-currency door.
   *
   * So the amount check is skipped when the currency is not the one quoted. It is a
   * belt-and-braces check, not the security boundary: the signature is verified and the
   * notification is confirmed with Payfast's own server before this runs. Logged rather than
   * silent, because an unexpected currency is worth seeing.
   */
  const currency = params.get("currency")?.toUpperCase();
  if (currency && currency !== "ZAR") {
    logger.info("payfast_itn_amount_check_skipped_foreign_currency", {
      currency,
      gross,
      quotedCents,
    });
    return true;
  }

  // Compared in minor units: 0.1 + 0.2 style float error on a rand figure is exactly how an
  // equality test on money goes wrong.
  return Math.round(gross * 100) === Math.round(quotedCents);
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
