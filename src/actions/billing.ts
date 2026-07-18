"use server";

import { randomBytes } from "node:crypto";

import { z } from "zod";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireTeacher } from "@/server/auth/session";
import { createPayfastSignature } from "@/services/payfast/signature";
import { updatePayfastSubscription } from "@/services/payfast/subscriptions";
import { fail, ok, type ActionResult } from "@/types/action";

const checkoutSchema = z.object({
  planSlug: z.enum(["starter", "professional", "business"]),
  interval: z.enum(["monthly", "annual"]),
});

export async function createSubscriptionCheckout(
  input: unknown,
): Promise<
  ActionResult<
    | { mode: "redirect"; url: string; fields: Record<string, string> }
    | { mode: "updated" }
    | { mode: "local"; planName: string }
  >
> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Choose a valid plan and billing interval.", "VALIDATION_ERROR");
  }

  const user = await requireTeacher();
  const membership = user.memberships.find((item) => item.role === "admin");
  if (!membership) {
    return fail("Only organization admins can change billing.", "FORBIDDEN");
  }

  if (
    !env.PAYFAST_MERCHANT_ID ||
    !env.PAYFAST_MERCHANT_KEY ||
    !env.PAYFAST_PASSPHRASE ||
    !env.PAYFAST_USD_ZAR_RATE
  ) {
    return fail(
      "PayFast billing is not configured. Add merchant credentials and PAYFAST_USD_ZAR_RATE.",
      "VALIDATION_ERROR",
    );
  }

  const plan = await db.plan.findUnique({ where: { slug: parsed.data.planSlug } });
  if (!plan) return fail("Plan not found.", "NOT_FOUND");
  const organization = await db.organization.findUniqueOrThrow({
    where: { id: membership.organizationId },
    select: {
      payfastToken: true,
      plan: {
        select: {
          slug: true,
          monthlyPriceCents: true,
        },
      },
      _count: {
        select: {
          studentRelationships: { where: { status: "active" } },
        },
      },
    },
  });
  if (
    plan.studentLimit !== null &&
    organization._count.studentRelationships > plan.studentLimit
  ) {
    return fail(
      `Archive active students before moving to a ${plan.studentLimit}-student plan.`,
      "PLAN_LIMIT_EXCEEDED",
    );
  }

  const usdCents =
    parsed.data.interval === "annual"
      ? plan.annualPriceCents
      : plan.monthlyPriceCents;
  const amountZar = ((usdCents / 100) * env.PAYFAST_USD_ZAR_RATE).toFixed(2);
  const appUrl = env.NEXT_PUBLIC_APP_URL;
  const appHost = new URL(appUrl).hostname;
  const isLocalApp = appHost === "localhost" || appHost === "127.0.0.1";
  const isPublicHttps = appUrl.startsWith("https://") && !isLocalApp;

  // Live PayFast cannot load with localhost URLs (CloudFront 403). In local dev,
  // activate the plan directly so billing can still be tested.
  if (isLocalApp && process.env.NODE_ENV !== "production") {
    if (plan.monthlyPriceCents < organization.plan.monthlyPriceCents) {
      return fail(
        "Paid-plan downgrades are scheduled separately to avoid losing access mid-cycle.",
        "VALIDATION_ERROR",
      );
    }
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + (parsed.data.interval === "annual" ? 12 : 1));
    await db.organization.update({
      where: { id: membership.organizationId },
      data: {
        planId: plan.id,
        billingInterval: parsed.data.interval,
        subscriptionStatus: "active",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: periodEnd,
      },
    });
    return ok({ mode: "local", planName: plan.name });
  }

  if (organization.payfastToken) {
    if (plan.monthlyPriceCents < organization.plan.monthlyPriceCents) {
      return fail(
        "Paid-plan downgrades are scheduled separately to avoid losing access mid-cycle.",
        "VALIDATION_ERROR",
      );
    }
    const updated = await updatePayfastSubscription({
      token: organization.payfastToken,
      amountCents: Math.round(Number(amountZar) * 100),
      frequency: parsed.data.interval === "annual" ? 6 : 3,
    });
    if (!updated) {
      return fail(
        "PayFast could not update the existing subscription. Your plan has not changed.",
        "INTERNAL_ERROR",
      );
    }
    await db.organization.update({
      where: { id: membership.organizationId },
      data: {
        planId: plan.id,
        billingInterval: parsed.data.interval,
        subscriptionStatus: "active",
        cancelAtPeriodEnd: false,
      },
    });
    return ok({ mode: "updated" });
  }
  if (organization.plan.slug !== "free") {
    return fail(
      "This paid account has no PayFast token. Contact support before changing plans.",
      "CONFLICT",
    );
  }

  const fields = new Map<string, string>([
    ["merchant_id", env.PAYFAST_MERCHANT_ID],
    ["merchant_key", env.PAYFAST_MERCHANT_KEY],
    ["return_url", new URL("/dashboard/teacher/billing?checkout=return", appUrl).toString()],
    ["cancel_url", new URL("/dashboard/teacher/billing?checkout=cancelled", appUrl).toString()],
  ]);

  // PayFast (and its CloudFront edge) rejects checkout when notify_url is not publicly reachable.
  if (isPublicHttps) {
    fields.set("notify_url", new URL("/api/v1/webhooks/payfast", appUrl).toString());
  }

  fields.set("email_address", user.email);
  fields.set("m_payment_id", `${membership.organizationId}-${randomBytes(8).toString("hex")}`);
  fields.set("amount", amountZar);
  fields.set("item_name", `Amazing Skills ${plan.name} ${parsed.data.interval}`);
  fields.set("custom_str1", membership.organizationId);
  fields.set("custom_str2", plan.id);
  fields.set("custom_str3", parsed.data.interval);
  fields.set("custom_str4", String(usdCents));
  fields.set("subscription_type", "1");
  fields.set("billing_date", new Date().toISOString().slice(0, 10));
  fields.set("recurring_amount", amountZar);
  fields.set("frequency", parsed.data.interval === "annual" ? "6" : "3");
  fields.set("cycles", "0");
  fields.set("signature", createPayfastSignature(fields.entries(), env.PAYFAST_PASSPHRASE));

  return ok({
    mode: "redirect",
    url:
      env.PAYFAST_SANDBOX === "true"
        ? "https://sandbox.payfast.co.za/eng/process"
        : "https://www.payfast.co.za/eng/process",
    fields: Object.fromEntries(fields),
  });
}
