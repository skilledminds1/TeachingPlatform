import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { DUNNING_NOTICE_DAYS, nextDunningStage } from "@/server/billing/lifecycle";
import { createNotification } from "@/server/notifications/notify";
import {
  cancelPayfastSubscription,
  updatePayfastSubscription,
} from "@/services/payfast/subscriptions";

type LifecycleSummary = {
  scanned: number;
  trialsEnded: number;
  cancellationsApplied: number;
  planChangesApplied: number;
  graceExpired: number;
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
        { trialEndsAt: { lte: now } },
        { graceStartedAt: { not: null } },
        { pendingChangeAt: { lte: now } },
        { cancelAtPeriodEnd: true, currentPeriodEnd: { lte: now } },
        { complimentaryExpiresAt: { lte: now } },
      ],
    },
    include: { pendingPlan: true },
  });
  const summary: LifecycleSummary = {
    scanned: organizations.length,
    trialsEnded: 0,
    cancellationsApplied: 0,
    planChangesApplied: 0,
    graceExpired: 0,
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
        organization.subscriptionStatus === "trialing" &&
        organization.trialEndsAt &&
        organization.trialEndsAt <= now
      ) {
        await db.organization.update({
          where: { id: organization.id },
          data: {
            planId: freePlan.id,
            subscriptionStatus: "active",
            trialEndsAt: null,
            currentPeriodEnd: null,
            pendingPlanId: null,
            pendingBillingInterval: null,
            pendingChangeAt: null,
          },
        });
        summary.trialsEnded += 1;
        await notifyAdmins(
          organization.id,
          "billing.trial_ended",
          "Paid trial ended",
          "Your 14-day paid trial ended. Your organization is now on Free.",
        );
        continue;
      }

      if (
        organization.cancelAtPeriodEnd &&
        organization.currentPeriodEnd &&
        organization.currentPeriodEnd <= now
      ) {
        const providerCancelled =
          !organization.payfastToken ||
          (await cancelPayfastSubscription(organization.payfastToken));
        if (!providerCancelled) {
          summary.failures += 1;
          continue;
        }
        await db.organization.update({
          where: { id: organization.id },
          data: {
            planId: freePlan.id,
            payfastToken: null,
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
        organization.payfastToken
      ) {
        const usdCents =
          organization.pendingBillingInterval === "annual"
            ? organization.pendingPlan.annualPriceCents
            : organization.pendingPlan.monthlyPriceCents;
        const updated =
          organization.pendingPlan.slug === "free"
            ? await cancelPayfastSubscription(organization.payfastToken)
            : await updatePayfastSubscription({
                token: organization.payfastToken,
                amountCents: Math.round(usdCents * (env.PAYFAST_USD_ZAR_RATE ?? 0)),
                frequency: organization.pendingBillingInterval === "annual" ? 6 : 3,
              });
        if (!updated) {
          summary.failures += 1;
          continue;
        }
        await db.organization.update({
          where: { id: organization.id },
          data: {
            planId: organization.pendingPlan.id,
            billingInterval: organization.pendingBillingInterval,
            payfastToken:
              organization.pendingPlan.slug === "free" ? null : organization.payfastToken,
            subscriptionStatus: "active",
            currentPeriodEnd:
              organization.pendingPlan.slug === "free" ? null : organization.currentPeriodEnd,
            pendingPlanId: null,
            pendingBillingInterval: null,
            pendingChangeAt: null,
          },
        });
        summary.planChangesApplied += 1;
        await notifyAdmins(
          organization.id,
          "billing.plan_changed",
          "Scheduled plan change applied",
          `Your organization is now on ${organization.pendingPlan.name}.`,
        );
        continue;
      }

      if (organization.subscriptionStatus === "past_due" && organization.graceStartedAt) {
        if (organization.graceEndsAt && organization.graceEndsAt <= now) {
          await db.organization.update({
            where: { id: organization.id },
            data: {
              planId: freePlan.id,
              payfastToken: null,
              subscriptionStatus: "cancelled",
              currentPeriodEnd: null,
              cancelAtPeriodEnd: false,
              graceStartedAt: null,
              graceEndsAt: null,
            },
          });
          summary.graceExpired += 1;
          await notifyAdmins(
            organization.id,
            "billing.grace_expired",
            "Subscription moved to read-only Free",
            "Payment was not recovered within 14 days. Existing learning remains accessible, but new growth actions are paused until checkout.",
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
                ? "Please recover payment now. New bookings and publishing pause after day 7; existing lessons and learning access remain available."
                : "Please update or retry billing. Your paid access remains available during the 14-day grace period.",
            );
            summary.noticesSent += 1;
          }
        }
      }
    } catch {
      summary.failures += 1;
    }
  }
  return summary;
}
