"use server";


import { z } from "zod";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireTeacher } from "@/server/auth/session";
import { enforceActionRateLimit } from "@/server/security/action-rate-limit";
import { getLiveLessonUsage } from "@/server/billing/entitlements";
import { getActiveSalesForPlans, getEffectivePlanPrice } from "@/server/billing/pricing";
import { isPaidPlanSlug, paddlePriceId } from "@/services/paddle/catalogue";
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
    | {
        mode: "paddle";
        priceId: string;
        organizationId: string;
        email: string;
        discountId: string | null;
      }
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

  // The client token is what opens the checkout, so without it there is nothing to send a
  // teacher to. Checked here rather than at the overlay so the failure is a sentence they can
  // read instead of a dead button.
  if (!env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN) {
    return fail(
      "Billing is not configured yet. Please try again shortly.",
      "VALIDATION_ERROR",
    );
  }

  const plan = await db.plan.findUnique({ where: { slug: parsed.data.planSlug } });
  if (!plan) return fail("Plan not found.", "NOT_FOUND");
  const organization = await db.organization.findUniqueOrThrow({
    where: { id: membership.organizationId },
    select: {
      paddleSubscriptionId: true,
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

  /**
   * Nothing here computes a charge. The price id IS the amount and the discount id IS the
   * promotion — both are Paddle catalogue objects, and this application only names them. That
   * is the point: see 20260808160000_price_plans_in_zar for the three ways working out a
   * number for itself went wrong.
   *
   * A sale with no paddleDiscountId resolves to no sale, in getEffectivePlanPrice and here
   * alike, so the plan card and the checkout can never disagree about whether a discount
   * exists.
   */
  const sales = await getActiveSalesForPlans([plan.id]);
  const priced = getEffectivePlanPrice(plan, parsed.data.interval, sales.get(plan.id));
  const discountId = priced.sale?.paddleDiscountId ?? null;

  const appUrl = env.NEXT_PUBLIC_APP_URL;
  const appHost = new URL(appUrl).hostname;
  const isLocalApp = appHost === "localhost" || appHost === "127.0.0.1";
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

  /**
   * Changing plan on a LIVE subscription is not wired yet.
   *
   * PayFast let this be done by repricing the token in place. The Paddle equivalent is a
   * subscription update through their API, with proration — which needs PADDLE_API_KEY, and
   * that is the one credential this integration does not yet hold.
   *
   * Failing loudly is the point. The alternative shapes are worse: silently doing nothing
   * leaves a teacher believing they upgraded, and starting a fresh checkout would leave them
   * paying for two subscriptions at once. Nobody hits this today — there are no live
   * subscriptions — but that will stop being true the moment Paddle is verified.
   */
  if (organization.paddleSubscriptionId) {
    return fail(
      "Changing plan on an active subscription is not available yet. Contact support and we will move you over.",
      "CONFLICT",
    );
  }

  if (!canStartFreshCheckout) {
    return fail(
      "This paid account has no PayFast token. Contact support before changing plans.",
      "CONFLICT",
    );
  }

  /**
   * Paddle is now the only rail.
   *
   * Nothing is signed and no amount is sent: the price id IS the amount, and Paddle is the
   * authority on what it costs. That deletes the entire class of defect that came from this
   * application computing a charge — see 20260808160000_price_plans_in_zar, where one
   * hand-maintained conversion rate produced three separate ways to bill the wrong number.
   *
   * organization_id rides along in custom_data because it is the only identifier the webhook
   * can trust to attach a subscription to the right organization. Paddle echoes it on every
   * notification for the life of the subscription.
   */
  if (!isPaidPlanSlug(plan.slug)) {
    return fail("That plan cannot be bought through checkout.", "VALIDATION_ERROR");
  }

  return ok({
    mode: "paddle" as const,
    priceId: paddlePriceId(plan.slug, parsed.data.interval),
    organizationId: membership.organizationId,
    email: user.email,
    discountId,
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
        paddleSubscriptionId: true,
        plan: { select: { id: true, name: true, monthlyPriceCents: true } },
        _count: {
          select: {
            studentRelationships: { where: { status: "active" } },
          },
        },
      },
    }),
    db.plan.findUnique({ where: { slug: parsed.data.planSlug } }),
    getLiveLessonUsage(admin.organizationId),
  ]);
  if (!target) return fail("Plan not found.", "NOT_FOUND");
  if (!organization.currentPeriodEnd || !organization.paddleSubscriptionId) {
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
    warning: `At period end, ${target.name} limits apply to new students and lessons. Existing bookings and lesson history remain available.`,
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
    select: { paddleSubscriptionId: true, currentPeriodEnd: true },
  });
  if (!organization.paddleSubscriptionId || !organization.currentPeriodEnd) {
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
    select: { paddleSubscriptionId: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
  });
  if (!organization.paddleSubscriptionId || !organization.currentPeriodEnd) {
    return fail("This subscription cannot be resumed. Start a new checkout instead.", "CONFLICT");
  }
  if (!organization.cancelAtPeriodEnd) return ok({ resumed: true });
  await db.organization.update({
    where: { id: admin.organizationId },
    data: { cancelAtPeriodEnd: false },
  });
  return ok({ resumed: true });
}
