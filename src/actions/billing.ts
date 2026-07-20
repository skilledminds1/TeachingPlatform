"use server";

import { randomBytes } from "node:crypto";

import { z } from "zod";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireTeacher } from "@/server/auth/session";
import { enforceActionRateLimit } from "@/server/security/action-rate-limit";
import {
  getActiveSalesForPlans,
  getEffectivePlanPrice,
} from "@/server/billing/pricing";
import { getLiveLessonUsage } from "@/server/billing/entitlements";
import { createPayfastSignature } from "@/services/payfast/signature";
import { updatePayfastSubscription } from "@/services/payfast/subscriptions";
import { fail, ok, type ActionResult } from "@/types/action";

const checkoutSchema = z.object({
  planSlug: z.enum(["starter", "professional", "business"]),
  interval: z.enum(["monthly", "annual"]),
});

const planChangeSchema = z.object({
  planSlug: z.enum(["free", "starter", "professional", "business"]),
  interval: z.enum(["monthly", "annual"]),
});

const clearComplimentary = {
  complimentaryPlanId: null,
  complimentaryExpiresAt: null,
  complimentaryGrantedById: null,
  complimentaryGrantedAt: null,
  complimentaryPreviousPlanId: null,
  complimentaryNote: null,
} as const;

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
  const limited = await enforceActionRateLimit({
    action: "subscription-checkout",
    limit: 5,
    windowMs: 10 * 60_000,
    userId: user.id,
  });
  if (limited) return limited;
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
      complimentaryPlanId: true,
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

  const sales = await getActiveSalesForPlans([plan.id]);
  const priced = getEffectivePlanPrice(
    plan,
    parsed.data.interval,
    sales.get(plan.id),
  );
  const usdCents = priced.effectiveCents;
  const amountZar = ((usdCents / 100) * env.PAYFAST_USD_ZAR_RATE).toFixed(2);
  const appUrl = env.NEXT_PUBLIC_APP_URL;
  const appHost = new URL(appUrl).hostname;
  const isLocalApp = appHost === "localhost" || appHost === "127.0.0.1";
  const isPublicHttps = appUrl.startsWith("https://") && !isLocalApp;
  const onComplimentary = Boolean(organization.complimentaryPlanId);
  const canStartFreshCheckout =
    organization.plan.slug === "free" || onComplimentary;

  // Live PayFast cannot load with localhost URLs (CloudFront 403). In local dev,
  // activate the plan directly so billing can still be tested.
  if (isLocalApp && process.env.NODE_ENV !== "production") {
    if (
      !onComplimentary &&
      plan.monthlyPriceCents < organization.plan.monthlyPriceCents
    ) {
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
        trialEndsAt: null,
        graceStartedAt: null,
        graceEndsAt: null,
        dunningStage: 0,
        dunningLastNoticeAt: null,
        pendingPlanId: null,
        pendingBillingInterval: null,
        pendingChangeAt: null,
        ...clearComplimentary,
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
        trialEndsAt: null,
        graceStartedAt: null,
        graceEndsAt: null,
        dunningStage: 0,
        dunningLastNoticeAt: null,
        pendingPlanId: null,
        pendingBillingInterval: null,
        pendingChangeAt: null,
        ...clearComplimentary,
      },
    });
    return ok({ mode: "updated" });
  }
  if (!canStartFreshCheckout) {
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
  fields.set(
    "item_name",
    priced.percentOff > 0
      ? `Amazing Skills ${plan.name} ${parsed.data.interval} (${priced.percentOff}% off)`
      : `Amazing Skills ${plan.name} ${parsed.data.interval}`,
  );
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

async function requireBillingAdmin() {
  const user = await requireTeacher();
  const membership = user.memberships.find((item) => item.role === "admin");
  return membership ? { user, organizationId: membership.organizationId } : null;
}

export async function schedulePlanChange(
  input: unknown,
): Promise<ActionResult<{ effectiveAt: Date; warning: string }>> {
  const parsed = planChangeSchema.safeParse(input);
  if (!parsed.success) return fail("Choose a valid plan and interval.", "VALIDATION_ERROR");
  const admin = await requireBillingAdmin();
  if (!admin) return fail("Only organization admins can change billing.", "FORBIDDEN");

  const [organization, target, lessonUsage] = await Promise.all([
    db.organization.findUniqueOrThrow({
      where: { id: admin.organizationId },
      select: {
        currentPeriodEnd: true,
        payfastToken: true,
        plan: { select: { id: true, name: true, monthlyPriceCents: true } },
        _count: {
          select: {
            studentRelationships: { where: { status: "active" } },
            courses: { where: { deletedAt: null } },
          },
        },
      },
    }),
    db.plan.findUnique({ where: { slug: parsed.data.planSlug } }),
    getLiveLessonUsage(admin.organizationId),
  ]);
  if (!target) return fail("Plan not found.", "NOT_FOUND");
  if (!organization.currentPeriodEnd || !organization.payfastToken) {
    return fail("Only active paid subscriptions can schedule a downgrade.", "CONFLICT");
  }
  if (target.monthlyPriceCents >= organization.plan.monthlyPriceCents) {
    return fail("Use immediate checkout for upgrades or equivalent plan changes.", "VALIDATION_ERROR");
  }

  const blockers: string[] = [];
  if (target.studentLimit !== null && organization._count.studentRelationships > target.studentLimit) {
    blockers.push(
      `${organization._count.studentRelationships} active students exceeds the ${target.studentLimit}-student limit`,
    );
  }
  if (target.courseLimit !== null && organization._count.courses > target.courseLimit) {
    blockers.push(`${organization._count.courses} courses exceeds the ${target.courseLimit}-course limit`);
  }
  if (
    target.monthlyLiveLessonMinutes !== null &&
    lessonUsage.usedMinutes > target.monthlyLiveLessonMinutes
  ) {
    blockers.push(
      `${lessonUsage.usedMinutes} live-lesson minutes this month exceeds the ${target.monthlyLiveLessonMinutes}-minute limit`,
    );
  }
  if (blockers.length > 0) {
    return fail(
      `This downgrade cannot be scheduled yet: ${blockers.join("; ")}. Archive the excess first.`,
      "PLAN_LIMIT_EXCEEDED",
    );
  }

  await db.organization.update({
    where: { id: admin.organizationId },
    data: {
      pendingPlanId: target.id,
      pendingBillingInterval: parsed.data.interval,
      pendingChangeAt: organization.currentPeriodEnd,
      cancelAtPeriodEnd: false,
    },
  });
  return ok({
    effectiveAt: organization.currentPeriodEnd,
    warning: `At period end, ${target.name} limits apply to new students, lessons, and courses. Existing learning records remain available.`,
  });
}

export async function cancelScheduledPlanChange(): Promise<ActionResult<{ cancelled: true }>> {
  const admin = await requireBillingAdmin();
  if (!admin) return fail("Only organization admins can change billing.", "FORBIDDEN");
  await db.organization.update({
    where: { id: admin.organizationId },
    data: { pendingPlanId: null, pendingBillingInterval: null, pendingChangeAt: null },
  });
  return ok({ cancelled: true });
}

export async function scheduleSubscriptionCancellation(): Promise<
  ActionResult<{ effectiveAt: Date }>
> {
  const admin = await requireBillingAdmin();
  if (!admin) return fail("Only organization admins can change billing.", "FORBIDDEN");
  const organization = await db.organization.findUniqueOrThrow({
    where: { id: admin.organizationId },
    select: { payfastToken: true, currentPeriodEnd: true },
  });
  if (!organization.payfastToken || !organization.currentPeriodEnd) {
    return fail("There is no paid subscription to cancel.", "CONFLICT");
  }
  await db.organization.update({
    where: { id: admin.organizationId },
    data: {
      cancelAtPeriodEnd: true,
      pendingPlanId: null,
      pendingBillingInterval: null,
      pendingChangeAt: null,
    },
  });
  return ok({ effectiveAt: organization.currentPeriodEnd });
}

export async function resumeSubscription(): Promise<ActionResult<{ resumed: true }>> {
  const admin = await requireBillingAdmin();
  if (!admin) return fail("Only organization admins can change billing.", "FORBIDDEN");
  const organization = await db.organization.findUniqueOrThrow({
    where: { id: admin.organizationId },
    select: { payfastToken: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
  });
  if (!organization.payfastToken || !organization.currentPeriodEnd) {
    return fail("This subscription cannot be resumed. Start a new checkout instead.", "CONFLICT");
  }
  if (!organization.cancelAtPeriodEnd) return ok({ resumed: true });
  await db.organization.update({
    where: { id: admin.organizationId },
    data: { cancelAtPeriodEnd: false },
  });
  return ok({ resumed: true });
}
