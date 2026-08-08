import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The two subscription-change paths: the in-place repricing of an existing mandate, and the
 * downgrade that is scheduled for period end.
 *
 * Scope note (QLT-02): only the *lifecycle invariants* of these actions are covered — which
 * fields a change that moves no money is allowed to touch, that local state never runs ahead
 * of the provider, and which allowances have to fit before a downgrade may be scheduled. The
 * checkout form built when there is no existing mandate (signed field construction, the SAST
 * billing_date, the ZAR conversion) is PayFast wire format and is deliberately not tested
 * here: it dies with the rail in PAY-05.
 */

type AnyRecord = Record<string, unknown>;

const state = {
  organization: {} as AnyRecord,
  plan: {} as AnyRecord,
  orgUpdates: [] as AnyRecord[],
  providerUpdates: [] as AnyRecord[],
  providerResult: true,
  liveLessonMinutesUsed: 0,
};

vi.mock("@/lib/db", () => ({
  db: {
    plan: { findUnique: vi.fn(async () => state.plan) },
    organization: {
      findUniqueOrThrow: vi.fn(async () => state.organization),
      update: vi.fn(async (args: AnyRecord) => {
        state.orgUpdates.push(args);
        return {};
      }),
    },
  },
}));

vi.mock("@/lib/env", () => ({
  env: {
    PAYFAST_MERCHANT_ID: "10000100",
    PAYFAST_MERCHANT_KEY: "merchant-key",
    PAYFAST_PASSPHRASE: "test-passphrase",
    NEXT_PUBLIC_APP_URL: "https://app.example.com",
  },
}));

vi.mock("@/server/auth/session", () => ({
  requireTeacher: vi.fn(async () => ({
    id: "user-1",
    memberships: [{ role: "admin", organizationId: "org-1" }],
  })),
}));

vi.mock("@/server/security/action-rate-limit", () => ({
  enforceActionRateLimit: vi.fn(async () => null),
}));

vi.mock("@/server/billing/pricing", () => ({
  getActiveSalesForPlans: vi.fn(async () => new Map()),
  getEffectivePlanPrice: vi.fn(() => ({ effectiveCents: 2900, listCents: 2900 })),
}));

vi.mock("@/server/billing/entitlements", () => ({
  getLiveLessonUsage: vi.fn(async () => ({
    usedMinutes: state.liveLessonMinutesUsed,
    limit: null,
  })),
}));

vi.mock("@/services/payfast/signature", () => ({
  PAYFAST_TIMEZONE: "Africa/Johannesburg",
  createPayfastSignature: vi.fn(() => "signature"),
}));

vi.mock("@/services/payfast/subscriptions", () => ({
  updatePayfastSubscription: vi.fn(async (input: AnyRecord) => {
    state.providerUpdates.push(input);
    return state.providerResult;
  }),
}));

const { createSubscriptionCheckout, schedulePlanChange } = await import("./billing");

const PAST_DUE = {
  subscriptionStatus: "past_due",
  graceStartedAt: new Date("2026-07-10T00:00:00.000Z"),
  graceEndsAt: new Date("2026-07-24T00:00:00.000Z"),
  dunningStage: 2,
};

beforeEach(() => {
  state.orgUpdates = [];
  state.providerUpdates = [];
  state.providerResult = true;
  state.liveLessonMinutesUsed = 0;
  state.plan = { id: "plan-business", slug: "business", name: "Business", monthlyPriceCents: 2900 };
  state.organization = {
    payfastToken: "tok-1",
    complimentaryPlanId: null,
    plan: { slug: "business", monthlyPriceCents: 2900 },
    _count: { studentRelationships: 0 },
    ...PAST_DUE,
  };
});

describe("changing plan on an existing mandate", () => {
  // MON-15. This path only reprices the FUTURE recurring charge — no money moves now.
  // Clearing the grace timers here let a past-due teacher escape the 7-day growth block and
  // the 14-day grace window by re-selecting the plan they were already on, and because each
  // subsequent failed charge restarts a fresh grace period the cycle repeated indefinitely.
  // Only a verified payment may clear past-due state.
  it("never clears past-due state, because no money moved", async () => {
    const result = await createSubscriptionCheckout({ planSlug: "business", interval: "monthly" });

    expect(result).toMatchObject({ success: true, data: { mode: "updated" } });
    expect(state.orgUpdates).toHaveLength(1);
    const data = (state.orgUpdates[0] as { data: AnyRecord }).data;
    expect(data).toMatchObject({ planId: "plan-business", billingInterval: "monthly" });
    for (const field of [
      "subscriptionStatus",
      "graceStartedAt",
      "graceEndsAt",
      "dunningStage",
      "dunningLastNoticeAt",
    ]) {
      expect(data).not.toHaveProperty(field);
    }
  });

  it("leaves local state untouched when the provider refuses the change", async () => {
    state.providerResult = false;

    const result = await createSubscriptionCheckout({ planSlug: "business", interval: "monthly" });

    expect(result).toMatchObject({ success: false, code: "INTERNAL_ERROR" });
    expect(state.orgUpdates).toHaveLength(0);
  });

  // Downgrades run through the scheduled path so the teacher keeps what they paid for until
  // the period ends; applying one in place would revoke access mid-cycle.
  it("refuses an in-place downgrade without calling the provider", async () => {
    state.plan = { id: "plan-starter", slug: "starter", name: "Starter", monthlyPriceCents: 900 };

    const result = await createSubscriptionCheckout({ planSlug: "starter", interval: "monthly" });

    expect(result).toMatchObject({ success: false, code: "VALIDATION_ERROR" });
    expect(state.providerUpdates).toHaveLength(0);
    expect(state.orgUpdates).toHaveLength(0);
  });

  it("supersedes a complimentary grant when a paid plan is selected", async () => {
    state.organization = { ...state.organization, complimentaryPlanId: "plan-pro" };

    await createSubscriptionCheckout({ planSlug: "business", interval: "monthly" });

    expect((state.orgUpdates[0] as { data: AnyRecord }).data).toMatchObject({
      complimentaryPlanId: null,
      complimentaryExpiresAt: null,
      complimentaryPreviousPlanId: null,
    });
  });
});

const PERIOD_END = new Date("2026-08-31T00:00:00.000Z");

describe("scheduling a downgrade for period end", () => {
  // A downgrade only becomes safe once the account already fits inside the cheaper plan.
  // Scheduling one while an allowance is still over-subscribed would silently revoke access
  // the moment the period rolls over, so both remaining allowances are checked up front.
  function downgradingBusinessToStarter(overrides: AnyRecord = {}) {
    state.plan = {
      id: "plan-starter",
      slug: "starter",
      name: "Starter",
      monthlyPriceCents: 900,
      studentLimit: 5,
      monthlyLiveLessonMinutes: 600,
    };
    state.organization = {
      currentPeriodEnd: PERIOD_END,
      payfastToken: "tok-1",
      plan: { id: "plan-business", name: "Business", monthlyPriceCents: 2900 },
      _count: { studentRelationships: 2 },
      ...overrides,
    };
  }

  it("refuses while active students exceed the target plan's limit", async () => {
    downgradingBusinessToStarter({ _count: { studentRelationships: 9 } });

    const result = await schedulePlanChange({ planSlug: "starter", interval: "monthly" });

    expect(result).toMatchObject({ success: false, code: "PLAN_LIMIT_EXCEEDED" });
    expect(state.orgUpdates).toHaveLength(0);
  });

  it("refuses while this month's live-lesson minutes exceed the target allowance", async () => {
    downgradingBusinessToStarter();
    state.liveLessonMinutesUsed = 900;

    const result = await schedulePlanChange({ planSlug: "starter", interval: "monthly" });

    expect(result).toMatchObject({ success: false, code: "PLAN_LIMIT_EXCEEDED" });
    expect(state.orgUpdates).toHaveLength(0);
  });

  it("schedules the change for period end once both allowances fit", async () => {
    downgradingBusinessToStarter();
    state.liveLessonMinutesUsed = 120;

    const result = await schedulePlanChange({ planSlug: "starter", interval: "monthly" });

    expect(result).toMatchObject({ success: true, data: { effectiveAt: PERIOD_END } });
    expect(state.orgUpdates).toHaveLength(1);
    expect((state.orgUpdates[0] as { data: AnyRecord }).data).toMatchObject({
      pendingPlanId: "plan-starter",
      pendingBillingInterval: "monthly",
      pendingChangeAt: PERIOD_END,
    });
  });
});
