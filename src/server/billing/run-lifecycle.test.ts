import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integration tests for the nightly subscription lifecycle job.
 *
 * lifecycle.test.ts covers the pure date helpers. This covers the branching, state-mutating
 * code around them — the part where every subscription critical in the audit actually lived,
 * and which had no coverage at all.
 *
 * Scope note (QLT-02): these are *lifecycle invariants* — grace transitions, dunning
 * advancement, provider/state divergence, replay idempotency. They hold for any subscription
 * provider, so they survive PAY-05 decommissioning the PayFast rail. PayFast's wire format
 * (ITN signature strings, checkout field construction, the ZAR/FX conversion itself) is
 * deliberately NOT tested here — it dies with the rail.
 *
 * Prisma, the provider client and the notifier are mocked at the module boundary, following
 * the shape of src/server/payments/confirm.test.ts. The assertions are about the *ordering
 * and conditions* of writes: which branch claimed the organization, whether a write happened
 * at all, and whether a provider call preceded it.
 */

type AnyRecord = Record<string, unknown>;

const FREE_PLAN = { id: "plan-free", slug: "free", name: "Free" };

const state = {
  organizations: [] as AnyRecord[],
  orgUpdates: [] as AnyRecord[],
  orgUpdateMany: [] as AnyRecord[],
  /** Rows affected by the guarded dunning claim. 0 means a concurrent run got there first. */
  dunningClaimCount: 1,
  notifications: [] as AnyRecord[],
  provider: {
    cancelled: [] as string[],
    updated: [] as AnyRecord[],
    cancelResult: true,
    updateResult: true,
  },
  fxRate: 18.5 as number | undefined,
  /** Makes organization.update reject for one organization, to test failure isolation. */
  updateThrowsForOrg: null as string | null,
};

const loggerError = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    plan: { findUniqueOrThrow: vi.fn(async () => FREE_PLAN) },
    organization: {
      findMany: vi.fn(async () => state.organizations),
      update: vi.fn(async (args: { where: { id: string } } & AnyRecord) => {
        if (state.updateThrowsForOrg === args.where.id) throw new Error("write failed");
        state.orgUpdates.push(args);
        return {};
      }),
      updateMany: vi.fn(async (args: AnyRecord) => {
        state.orgUpdateMany.push(args);
        return { count: state.dunningClaimCount };
      }),
    },
    organizationMember: {
      findMany: vi.fn(async () => [{ user: { id: "admin-1", email: "admin@example.com" } }]),
    },
  },
}));

vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_APP_URL: "https://app.example.com",
    // A getter so individual tests can unset the rate without re-mocking the module.
    get PAYFAST_USD_ZAR_RATE() {
      return state.fxRate;
    },
  },
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: {
    error: (...args: unknown[]) => loggerError(...args),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/server/notifications/notify", () => ({
  createNotification: vi.fn(async (input: AnyRecord) => {
    state.notifications.push(input);
    return {};
  }),
}));

vi.mock("@/services/payfast/subscriptions", () => ({
  cancelPayfastSubscription: vi.fn(async (token: string) => {
    state.provider.cancelled.push(token);
    return state.provider.cancelResult;
  }),
  updatePayfastSubscription: vi.fn(async (input: AnyRecord) => {
    state.provider.updated.push(input);
    return state.provider.updateResult;
  }),
}));

const { runSubscriptionLifecycle } = await import("./run-lifecycle");

const NOW = new Date("2026-07-19T12:00:00.000Z");
const DAY_MS = 86_400_000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);
const daysAhead = (days: number) => new Date(NOW.getTime() + days * DAY_MS);

function organization(overrides: AnyRecord = {}): AnyRecord {
  return {
    id: "org-1",
    deletedAt: null,
    planId: "plan-starter",
    billingInterval: "monthly",
    subscriptionStatus: "active",
    payfastToken: "tok-1",
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    trialEndsAt: null,
    graceStartedAt: null,
    graceEndsAt: null,
    dunningStage: 0,
    dunningLastNoticeAt: null,
    pendingPlanId: null,
    pendingBillingInterval: null,
    pendingChangeAt: null,
    pendingPlan: null,
    complimentaryPlanId: null,
    complimentaryExpiresAt: null,
    ...overrides,
  };
}

function plan(overrides: AnyRecord = {}): AnyRecord {
  return {
    id: "plan-business",
    slug: "business",
    name: "Business",
    monthlyPriceCents: 2900,
    annualPriceCents: 29900,
    ...overrides,
  };
}

/** The data payload of the single organization.update the run performed. */
function soleUpdate(): AnyRecord {
  expect(state.orgUpdates).toHaveLength(1);
  return (state.orgUpdates[0] as { data: AnyRecord }).data;
}

beforeEach(() => {
  state.organizations = [];
  state.orgUpdates = [];
  state.orgUpdateMany = [];
  state.dunningClaimCount = 1;
  state.notifications = [];
  state.provider.cancelled = [];
  state.provider.updated = [];
  state.provider.cancelResult = true;
  state.provider.updateResult = true;
  state.fxRate = 18.5;
  state.updateThrowsForOrg = null;
  loggerError.mockClear();
});

describe("trial expiry", () => {
  it("drops an expired trial to Free and clears the trial marker", async () => {
    state.organizations = [
      organization({ subscriptionStatus: "trialing", trialEndsAt: daysAgo(1), planId: "plan-pro" }),
    ];

    const summary = await runSubscriptionLifecycle(NOW);

    expect(summary.trialsEnded).toBe(1);
    expect(soleUpdate()).toMatchObject({
      planId: FREE_PLAN.id,
      subscriptionStatus: "active",
      trialEndsAt: null,
      currentPeriodEnd: null,
      pendingPlanId: null,
      pendingChangeAt: null,
    });
    expect(state.notifications[0]).toMatchObject({ type: "billing.trial_ended" });
  });

  it("leaves a trial that has not yet expired alone", async () => {
    state.organizations = [
      organization({ subscriptionStatus: "trialing", trialEndsAt: daysAhead(1) }),
    ];

    const summary = await runSubscriptionLifecycle(NOW);

    expect(summary.trialsEnded).toBe(0);
    expect(state.orgUpdates).toHaveLength(0);
  });
});

describe("complimentary access", () => {
  // A complimentary grant outranks every other branch. Without this precedence an admin's
  // goodwill upgrade could be silently cancelled by a stale cancelAtPeriodEnd flag.
  it("wins over a due cancellation while it is still live", async () => {
    state.organizations = [
      organization({
        complimentaryPlanId: "plan-pro",
        complimentaryExpiresAt: daysAhead(10),
        cancelAtPeriodEnd: true,
        currentPeriodEnd: daysAgo(1),
      }),
    ];

    const summary = await runSubscriptionLifecycle(NOW);

    expect(state.orgUpdates).toHaveLength(0);
    expect(state.provider.cancelled).toHaveLength(0);
    expect(summary.cancellationsApplied).toBe(0);
  });

  it("drops to Free and clears every complimentary field at expiry", async () => {
    state.organizations = [
      organization({ complimentaryPlanId: "plan-pro", complimentaryExpiresAt: daysAgo(1) }),
    ];

    const summary = await runSubscriptionLifecycle(NOW);

    expect(summary.complimentaryExpired).toBe(1);
    expect(soleUpdate()).toMatchObject({
      planId: FREE_PLAN.id,
      subscriptionStatus: "active",
      complimentaryPlanId: null,
      complimentaryExpiresAt: null,
      complimentaryPreviousPlanId: null,
      pendingPlanId: null,
      pendingChangeAt: null,
    });
    expect(state.notifications[0]).toMatchObject({ type: "billing.complimentary_expired" });
  });
});

describe("scheduled cancellation", () => {
  it("cancels at the provider before downgrading", async () => {
    state.organizations = [
      organization({ cancelAtPeriodEnd: true, currentPeriodEnd: daysAgo(1) }),
    ];

    const summary = await runSubscriptionLifecycle(NOW);

    expect(state.provider.cancelled).toEqual(["tok-1"]);
    expect(summary.cancellationsApplied).toBe(1);
    expect(soleUpdate()).toMatchObject({
      planId: FREE_PLAN.id,
      payfastToken: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
  });

  // Local state must never claim the subscription ended while the provider still holds a
  // live mandate — that is the direction that keeps charging a downgraded organization.
  it("leaves state untouched and counts a failure when the provider refuses", async () => {
    state.provider.cancelResult = false;
    state.organizations = [
      organization({ cancelAtPeriodEnd: true, currentPeriodEnd: daysAgo(1) }),
    ];

    const summary = await runSubscriptionLifecycle(NOW);

    expect(state.orgUpdates).toHaveLength(0);
    expect(summary.failures).toBe(1);
    expect(summary.cancellationsApplied).toBe(0);
    expect(state.notifications).toHaveLength(0);
  });

  // MON-13. A CANCELLED notification nulls the token precisely so this branch stops asking
  // the provider to cancel a subscription it has already cancelled. Before the fix the call
  // failed every night, the downgrade never applied, and the organization kept paid
  // entitlements forever while nothing was being charged. cancelResult is forced to false
  // here so the test fails if the short-circuit is ever removed.
  it("downgrades without a provider round-trip once the token is gone", async () => {
    state.provider.cancelResult = false;
    state.organizations = [
      organization({ cancelAtPeriodEnd: true, currentPeriodEnd: daysAgo(1), payfastToken: null }),
    ];

    const summary = await runSubscriptionLifecycle(NOW);

    expect(state.provider.cancelled).toHaveLength(0);
    expect(summary.cancellationsApplied).toBe(1);
    expect(summary.failures).toBe(0);
    expect(soleUpdate()).toMatchObject({ planId: FREE_PLAN.id, cancelAtPeriodEnd: false });
  });

  it("waits until the period actually ends", async () => {
    state.organizations = [
      organization({ cancelAtPeriodEnd: true, currentPeriodEnd: daysAhead(3) }),
    ];

    const summary = await runSubscriptionLifecycle(NOW);

    expect(state.provider.cancelled).toHaveLength(0);
    expect(state.orgUpdates).toHaveLength(0);
    expect(summary.cancellationsApplied).toBe(0);
  });
});

describe("scheduled plan change", () => {
  const pending = (overrides: AnyRecord = {}) =>
    organization({
      pendingPlan: plan(),
      pendingPlanId: "plan-business",
      pendingBillingInterval: "annual",
      pendingChangeAt: daysAgo(1),
      currentPeriodEnd: daysAhead(20),
      ...overrides,
    });

  it("applies the change only after the provider confirms", async () => {
    state.organizations = [pending()];

    const summary = await runSubscriptionLifecycle(NOW);

    expect(state.provider.updated).toEqual([
      { token: "tok-1", amountCents: Math.round(29900 * 18.5), frequency: 6 },
    ]);
    expect(summary.planChangesApplied).toBe(1);
    expect(soleUpdate()).toMatchObject({
      planId: "plan-business",
      billingInterval: "annual",
      payfastToken: "tok-1",
      currentPeriodEnd: daysAhead(20),
      pendingPlanId: null,
      pendingBillingInterval: null,
      pendingChangeAt: null,
    });
  });

  it("uses the monthly price and monthly frequency for a monthly change", async () => {
    state.organizations = [pending({ pendingBillingInterval: "monthly" })];

    await runSubscriptionLifecycle(NOW);

    expect(state.provider.updated).toEqual([
      { token: "tok-1", amountCents: Math.round(2900 * 18.5), frequency: 3 },
    ]);
  });

  // MON-14. The recurring amount was `Math.round(usdCents * (rate ?? 0))`, so an unset rate
  // asked the provider to set a live subscription's recurring charge to zero while granting
  // the new plan. The invariant survives the rail: a plan change whose price cannot be
  // computed must make no provider call and must not grant the plan.
  it("makes no provider call and grants nothing when the price cannot be computed", async () => {
    state.fxRate = undefined;
    state.organizations = [pending()];

    const summary = await runSubscriptionLifecycle(NOW);

    expect(state.provider.updated).toHaveLength(0);
    expect(state.provider.cancelled).toHaveLength(0);
    expect(state.orgUpdates).toHaveLength(0);
    expect(summary.planChangesApplied).toBe(0);
    expect(summary.failures).toBe(1);
    expect(loggerError).toHaveBeenCalledWith(
      "subscription_plan_change_missing_fx_rate",
      expect.objectContaining({ organizationId: "org-1" }),
    );
  });

  it("leaves state untouched and counts a failure when the provider refuses", async () => {
    state.provider.updateResult = false;
    state.organizations = [pending()];

    const summary = await runSubscriptionLifecycle(NOW);

    expect(state.orgUpdates).toHaveLength(0);
    expect(summary.planChangesApplied).toBe(0);
    expect(summary.failures).toBe(1);
  });

  // A downgrade to Free is a cancellation, not a repriced mandate, so it needs no price and
  // must retire the token rather than leave a live one pointing at a free plan.
  it("cancels the mandate for a downgrade to Free without needing a price", async () => {
    state.fxRate = undefined;
    state.organizations = [
      pending({ pendingPlan: plan({ id: "plan-free", slug: "free", name: "Free" }) }),
    ];

    const summary = await runSubscriptionLifecycle(NOW);

    expect(state.provider.cancelled).toEqual(["tok-1"]);
    expect(state.provider.updated).toHaveLength(0);
    expect(summary.planChangesApplied).toBe(1);
    expect(soleUpdate()).toMatchObject({
      planId: "plan-free",
      payfastToken: null,
      currentPeriodEnd: null,
    });
  });

  it("does not apply a change that is not yet due", async () => {
    state.organizations = [pending({ pendingChangeAt: daysAhead(5) })];

    const summary = await runSubscriptionLifecycle(NOW);

    expect(state.provider.updated).toHaveLength(0);
    expect(summary.planChangesApplied).toBe(0);
  });
});

describe("grace expiry", () => {
  // MON-20. Grace expiry used to set subscriptionStatus 'cancelled', which isGrowthBlocked
  // treats as blocked unconditionally — so a teacher whose card merely expired was left
  // read-only forever, unable to use even the Free plan's own allowance.
  it("lands on Free in an active state rather than a blocked one", async () => {
    state.organizations = [
      organization({
        subscriptionStatus: "past_due",
        graceStartedAt: daysAgo(14),
        graceEndsAt: daysAgo(1),
        dunningStage: 3,
        pendingPlanId: "plan-pro",
        pendingChangeAt: daysAgo(30),
      }),
    ];

    const summary = await runSubscriptionLifecycle(NOW);

    expect(summary.graceExpired).toBe(1);
    const data = soleUpdate();
    expect(data.subscriptionStatus).toBe("active");
    expect(data.subscriptionStatus).not.toBe("cancelled");
    expect(data).toMatchObject({
      planId: FREE_PLAN.id,
      payfastToken: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      graceStartedAt: null,
      graceEndsAt: null,
      dunningStage: 0,
      dunningLastNoticeAt: null,
      // Stale pending rows otherwise re-matched the scan query on every future run.
      pendingPlanId: null,
      pendingBillingInterval: null,
      pendingChangeAt: null,
    });
    expect(state.notifications[0]).toMatchObject({ type: "billing.grace_expired" });
  });

  it("keeps paid access while the grace window is still open", async () => {
    state.organizations = [
      organization({
        subscriptionStatus: "past_due",
        graceStartedAt: daysAgo(2),
        graceEndsAt: daysAhead(12),
        dunningStage: 3,
      }),
    ];

    const summary = await runSubscriptionLifecycle(NOW);

    expect(summary.graceExpired).toBe(0);
    expect(state.orgUpdates).toHaveLength(0);
  });
});

describe("dunning advancement", () => {
  const pastDue = (overrides: AnyRecord = {}) =>
    organization({
      subscriptionStatus: "past_due",
      graceStartedAt: daysAgo(3),
      graceEndsAt: daysAhead(11),
      dunningStage: 1,
      ...overrides,
    });

  it("claims the next stage conditionally before sending its notice", async () => {
    state.organizations = [pastDue()];

    const summary = await runSubscriptionLifecycle(NOW);

    expect(state.orgUpdateMany).toEqual([
      {
        where: { id: "org-1", dunningStage: { lt: 2 } },
        data: { dunningStage: 2, dunningLastNoticeAt: NOW },
      },
    ]);
    expect(summary.noticesSent).toBe(1);
    expect(state.notifications[0]).toMatchObject({ type: "billing.payment_failed.day_3" });
  });

  // The claim is the only thing standing between a retried or overlapping run and a second
  // copy of the same dunning email. When it affects no rows another run already sent it, so
  // this one must stay silent — the same defect class QLT-01 found in markAttemptFailed.
  it("sends nothing when a concurrent run already claimed the stage", async () => {
    state.dunningClaimCount = 0;
    state.organizations = [pastDue()];

    const summary = await runSubscriptionLifecycle(NOW);

    expect(state.orgUpdateMany).toHaveLength(1);
    expect(state.notifications).toHaveLength(0);
    expect(summary.noticesSent).toBe(0);
  });

  it("does not re-send a stage that is already recorded", async () => {
    state.organizations = [pastDue({ dunningStage: 2 })];

    const summary = await runSubscriptionLifecycle(NOW);

    expect(state.orgUpdateMany).toHaveLength(0);
    expect(state.notifications).toHaveLength(0);
    expect(summary.noticesSent).toBe(0);
  });

  it("escalates the wording once payment is at least six days overdue", async () => {
    state.organizations = [pastDue({ graceStartedAt: daysAgo(6), dunningStage: 2 })];

    await runSubscriptionLifecycle(NOW);

    expect(state.notifications[0]).toMatchObject({ type: "billing.payment_failed.day_6" });
    expect(String((state.notifications[0] as AnyRecord).body)).toContain("pause after day 7");
  });
});

describe("missed renewal watchdog", () => {
  // MON-17. Grace only ever started from a FAILED notification, so a lost delivery or an
  // unreported failure mode left the organization on paid entitlements indefinitely while
  // never being charged again. This branch makes billing state converge on its own.
  it("starts grace and alerts when a period lapsed with no renewal", async () => {
    state.organizations = [
      organization({ subscriptionStatus: "active", currentPeriodEnd: daysAgo(3) }),
    ];

    const summary = await runSubscriptionLifecycle(NOW);

    expect(loggerError).toHaveBeenCalledWith(
      "subscription_renewal_missing",
      expect.objectContaining({ organizationId: "org-1" }),
    );
    expect(summary.missedRenewals).toBe(1);
    expect(soleUpdate()).toMatchObject({
      subscriptionStatus: "past_due",
      graceStartedAt: NOW,
      graceEndsAt: daysAhead(14),
      dunningStage: 0,
    });
    expect(state.notifications[0]).toMatchObject({ type: "billing.renewal_missing" });
  });

  // Otherwise every nightly run would push graceEndsAt out by another 14 days and the
  // organization would never actually leave grace.
  it("does not restart a grace period that is already running", async () => {
    state.organizations = [
      organization({
        subscriptionStatus: "active",
        currentPeriodEnd: daysAgo(9),
        graceStartedAt: daysAgo(6),
        graceEndsAt: daysAhead(8),
      }),
    ];

    const summary = await runSubscriptionLifecycle(NOW);

    expect(summary.missedRenewals).toBe(0);
    expect(state.orgUpdates).toHaveLength(0);
  });

  it("absorbs normal provider retry delay before declaring a renewal missed", async () => {
    state.organizations = [
      organization({ subscriptionStatus: "active", currentPeriodEnd: daysAgo(1) }),
    ];

    const summary = await runSubscriptionLifecycle(NOW);

    expect(summary.missedRenewals).toBe(0);
    expect(state.orgUpdates).toHaveLength(0);
  });

  it("ignores an organization with no provider mandate", async () => {
    state.organizations = [
      organization({ subscriptionStatus: "active", currentPeriodEnd: daysAgo(9), payfastToken: null }),
    ];

    const summary = await runSubscriptionLifecycle(NOW);

    expect(summary.missedRenewals).toBe(0);
    expect(state.orgUpdates).toHaveLength(0);
  });
});

// One organization failing must not abandon the rest of the night's work — the run is the
// only thing that advances grace, dunning and expiry for every other subscriber.
it("isolates a failing organization from the rest of the run", async () => {
  state.updateThrowsForOrg = "org-1";
  state.organizations = [
    organization({ id: "org-1", subscriptionStatus: "trialing", trialEndsAt: daysAgo(1) }),
    organization({ id: "org-2", subscriptionStatus: "trialing", trialEndsAt: daysAgo(1) }),
  ];

  const summary = await runSubscriptionLifecycle(NOW);

  expect(summary.scanned).toBe(2);
  expect(summary.failures).toBe(1);
  expect(summary.trialsEnded).toBe(1);
  expect(state.orgUpdates).toHaveLength(1);
  expect((state.orgUpdates[0] as { where: { id: string } }).where.id).toBe("org-2");
});
