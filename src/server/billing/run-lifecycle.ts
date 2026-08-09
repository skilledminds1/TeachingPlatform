import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/observability/logger";
import {
  DUNNING_NOTICE_DAYS,
  nextDunningStage,
  startPaymentGrace,
} from "@/server/billing/lifecycle";
import { createNotification } from "@/server/notifications/notify";

/**
 * How long past currentPeriodEnd an active subscription may sit before we assume the
 * renewal notification was lost. Generous enough to absorb normal provider retry delay.
 */
const MISSED_RENEWAL_GRACE_DAYS = 2;

type LifecycleSummary = {
  scanned: number;
  cancellationsApplied: number;
  planChangesApplied: number;
  graceExpired: number;
  missedRenewals: number;
  complimentaryExpired: number;
  noticesSent: number;
  failures: number;
};

async function notifyAdmins(
  organizationId: string,
  type: string,
  title: string,
  body: string,
): Promise<void> {
  const admins = await db.organizationMember.findMany({
    where: { organizationId, role: "admin" },
    select: { user: { select: { id: true, email: true } } },
  });
  await Promise.all(
    admins.map(({ user }) =>
      createNotification({
        userId: user.id,
        type,
        title,
        body,
        href: "/dashboard/teacher/billing",
        metadata: { organizationId },
        email: {
          to: user.email,
          subject: title,
          category: "payment",
          template: {
            heading: title,
            paragraphs: [body],
            action: {
              label: "Manage billing",
              href: `${env.NEXT_PUBLIC_APP_URL}/dashboard/teacher/billing`,
            },
          },
        },
      }),
    ),
  );
}

export async function runSubscriptionLifecycle(now = new Date()): Promise<LifecycleSummary> {
  const freePlan = await db.plan.findUniqueOrThrow({ where: { slug: "free" } });
  const organizations = await db.organization.findMany({
    where: {
      deletedAt: null,
      OR: [
        { graceStartedAt: { not: null } },
        { pendingChangeAt: { lte: now } },
        { cancelAtPeriodEnd: true, currentPeriodEnd: { lte: now } },
        { complimentaryExpiresAt: { lte: now } },
        // MON-17: an active subscription whose period lapsed without a renewal ITN.
        // Grace previously started ONLY from a FAILED notification, so if PayFast never
        // sent one — an unhandled failure mode, a lost delivery during a deploy, a 5xx,
        // exhausted retries — the organization matched nothing here and kept paid
        // entitlements indefinitely while never being charged again.
        //
        // PAY-01: deliberately NOT filtered on paddleSubscriptionId. Annual is bought as a once-off
        // so that PayFast will offer Instant EFT and the wallets, which means there is no
        // token to find — and while this clause required one, every annual organization sailed
        // past its period end still marked active and kept a paid plan for nothing, for ever.
        // Complimentary grants and free plans are excluded because their lapse is somebody
        // else's branch above. Keyed on complimentaryPlanId, not complimentaryExpiresAt: the
        // expiry is nullable, so a grant made permanent has no expiry at all and filtering on
        // that would have swept exactly the organizations meant to be exempt.
        {
          subscriptionStatus: "active",
          complimentaryPlanId: null,
          plan: { slug: { not: "free" } },
          currentPeriodEnd: { lt: new Date(now.getTime() - MISSED_RENEWAL_GRACE_DAYS * 86_400_000) },
        },
      ],
    },
    include: { pendingPlan: true, plan: { select: { slug: true } } },
  });
  const summary: LifecycleSummary = {
    scanned: organizations.length,
    cancellationsApplied: 0,
    planChangesApplied: 0,
    graceExpired: 0,
    missedRenewals: 0,
    complimentaryExpired: 0,
    noticesSent: 0,
    failures: 0,
  };

  for (const organization of organizations) {
    try {
      // Complimentary access wins until its expiry. Paid checkout clears it.
      if (
        organization.complimentaryPlanId &&
        (!organization.complimentaryExpiresAt || organization.complimentaryExpiresAt > now)
      ) {
        continue;
      }
      if (
        organization.complimentaryPlanId &&
        organization.complimentaryExpiresAt &&
        organization.complimentaryExpiresAt <= now
      ) {
        await db.organization.update({
          where: { id: organization.id },
          data: {
            planId: freePlan.id,
            subscriptionStatus: "active",
            currentPeriodEnd: null,
            complimentaryPlanId: null,
            complimentaryExpiresAt: null,
            complimentaryGrantedById: null,
            complimentaryGrantedAt: null,
            complimentaryPreviousPlanId: null,
            complimentaryNote: null,
            pendingPlanId: null,
            pendingBillingInterval: null,
            pendingChangeAt: null,
          },
        });
        summary.complimentaryExpired += 1;
        await notifyAdmins(
          organization.id,
          "billing.complimentary_expired",
          "Complimentary plan ended",
          "Your complimentary plan ended and your organization is now on Free.",
        );
        continue;
      }

      if (
        organization.cancelAtPeriodEnd &&
        organization.currentPeriodEnd &&
        organization.currentPeriodEnd <= now
      ) {
        /**
         * The provider is no longer told anything here, and that is a real gap.
         *
         * PayFast could be cancelled from this job. Paddle cannot without PADDLE_API_KEY, and
         * downgrading locally while a Paddle subscription keeps billing would be worse than
         * doing nothing at all — the teacher loses the plan AND keeps paying for it.
         *
         * So a live Paddle subscription is skipped and shouted about rather than half-applied.
         * Organizations with no subscription (a complimentary grant lapsing, a plan set by
         * hand) still cancel cleanly, which is every case that exists today.
         */
        if (organization.paddleSubscriptionId) {
          logger.error("subscription_cancellation_needs_paddle_api", {
            organizationId: organization.id,
            paddleSubscriptionId: organization.paddleSubscriptionId,
          });
          summary.failures += 1;
          continue;
        }
        await db.organization.update({
          where: { id: organization.id },
          data: {
            planId: freePlan.id,
            paddleSubscriptionId: null,
            subscriptionStatus: "active",
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            pendingPlanId: null,
            pendingBillingInterval: null,
            pendingChangeAt: null,
          },
        });
        summary.cancellationsApplied += 1;
        await notifyAdmins(
          organization.id,
          "billing.cancelled",
          "Subscription ended",
          "Your paid subscription ended as scheduled. Your organization is now on Free.",
        );
        continue;
      }

      if (
        organization.pendingPlan &&
        organization.pendingBillingInterval &&
        organization.pendingChangeAt &&
        organization.pendingChangeAt <= now &&
        organization.paddleSubscriptionId
      ) {
        const planPriceCents =
          organization.pendingBillingInterval === "annual"
            ? organization.pendingPlan.annualPriceCents
            : organization.pendingPlan.monthlyPriceCents;
        // MON-14: the invariant survives the removal of the FX rate, because the hazard did.
        //
        // This used to be `usdCents * PAYFAST_USD_ZAR_RATE`, guarded against the rate being
        // unset — the earlier `?? 0` fallback asked PayFast to set a live subscription's
        // recurring charge to R0.00 while granting the new plan. There is no rate to be
        // missing now, but a paid plan priced at zero is a data error that produces exactly
        // the same outcome, so the guard moves to the price itself rather than disappearing.
        if (organization.pendingPlan.slug !== "free" && planPriceCents <= 0) {
          logger.error("subscription_plan_change_zero_price", {
            organizationId: organization.id,
            pendingPlanId: organization.pendingPlan.id,
            planPriceCents,
          });
          summary.failures += 1;
          continue;
        }

        // Same gap as the cancellation branch above: repricing or ending a Paddle subscription
        // needs PADDLE_API_KEY. Applying the plan locally while Paddle keeps billing the old
        // amount would charge one price and grant another, so the change waits.
        logger.error("subscription_plan_change_needs_paddle_api", {
          organizationId: organization.id,
          paddleSubscriptionId: organization.paddleSubscriptionId,
          pendingPlanId: organization.pendingPlan.id,
        });
        summary.failures += 1;
                continue;
      }

      if (organization.subscriptionStatus === "past_due" && organization.graceStartedAt) {
        if (organization.graceEndsAt && organization.graceEndsAt <= now) {
          await db.organization.update({
            where: { id: organization.id },
            data: {
              planId: freePlan.id,
              paddleSubscriptionId: null,
              // MON-20: previously "cancelled", which isGrowthBlocked treats as blocked
              // unconditionally — so a teacher whose card simply expired was left read-only
              // forever, unable to use even the Free plan's own allowance. The spec says
              // they drop to Free with Free limits, and the Free plan already constrains
              // growth on its own.
              subscriptionStatus: "active",
              currentPeriodEnd: null,
              cancelAtPeriodEnd: false,
              graceStartedAt: null,
              graceEndsAt: null,
              dunningStage: 0,
              dunningLastNoticeAt: null,
              // Stale pending* rows otherwise matched the scan query on every future run.
              pendingPlanId: null,
              pendingBillingInterval: null,
              pendingChangeAt: null,
            },
          });
          summary.graceExpired += 1;
          await notifyAdmins(
            organization.id,
            "billing.grace_expired",
            "Subscription moved to read-only Free",
            "Payment was not recovered within 14 days. Lessons already booked go ahead as normal, but new growth actions are paused until checkout.",
          );
          continue;
        }
        const stage = nextDunningStage(organization.graceStartedAt, organization.dunningStage, now);
        if (stage) {
          const claimed = await db.organization.updateMany({
            where: { id: organization.id, dunningStage: { lt: stage } },
            data: { dunningStage: stage, dunningLastNoticeAt: now },
          });
          if (claimed.count) {
            const day = DUNNING_NOTICE_DAYS[stage - 1];
            await notifyAdmins(
              organization.id,
              `billing.payment_failed.day_${day}`,
              day === 0 ? "Subscription payment failed" : `Payment still overdue (${day} days)`,
              day >= 6
                ? "Please recover payment now. New bookings pause after day 7; lessons already booked go ahead as normal."
                : "Please update or retry billing. Your paid access remains available during the 14-day grace period.",
            );
            summary.noticesSent += 1;
          }
        }
      }

      // MON-17: an active paid subscription whose period lapsed without any renewal
      // notification. Something was missed — a lost webhook, exhausted provider retries, a
      // failure mode PayFast does not report as FAILED — and the organization would
      // otherwise keep paid entitlements forever without being charged. Start the normal
      // grace flow so billing state converges even when notifications go astray.
      if (
        organization.subscriptionStatus === "active" &&
        organization.plan.slug !== "free" &&
        !organization.complimentaryPlanId &&
        organization.currentPeriodEnd &&
        organization.currentPeriodEnd.getTime() <
          now.getTime() - MISSED_RENEWAL_GRACE_DAYS * 86_400_000 &&
        !organization.graceStartedAt
      ) {
        logger.error("subscription_renewal_missing", {
          organizationId: organization.id,
          currentPeriodEnd: organization.currentPeriodEnd,
        });
        await db.organization.update({
          where: { id: organization.id },
          data: startPaymentGrace(now),
        });
        summary.missedRenewals += 1;
        // Two different people get this. One has a card on file that failed; the other paid
        // annually by EFT and was never going to be charged again. Telling the second to
        // "check your payment method" describes a card they never had.
        await notifyAdmins(
          organization.id,
          "billing.renewal_missing",
          organization.paddleSubscriptionId
            ? "We could not confirm your subscription renewal"
            : "Your annual plan has ended — renew to keep your access",
          organization.paddleSubscriptionId
            ? "Your billing period ended but we have not received confirmation of a renewal payment. Please check your payment method — paid access continues during the grace period."
            : "Your annual plan does not renew automatically, and its term has now ended. Pay for another year from your billing page to keep your listing and bookings — paid access continues during the grace period.",
        );
        continue;
      }
    } catch {
      summary.failures += 1;
    }
  }
  return summary;
}
