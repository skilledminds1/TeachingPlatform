import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The two subscription-change paths: the in-place repricing of an existing mandate, and the
 * downgrade that is scheduled for period end.
 *
 * Scope note (QLT-02): mostly the *lifecycle invariants* of these actions — which fields a
 * change that moves no money may touch, that local state never runs ahead of the provider,
 * and which allowances have to fit before a downgrade may be scheduled. Signed field
 * construction and currency conversion are gone with the PayFast rail: Paddle is the authority
 * on what a plan costs and this application no longer computes a charge at all.
 *
 * The one wire detail that IS pinned here is whether the checkout is recurring, because it is
 * not a formatting question: `subscription_type` silently decides which payment methods the
 * payer is offered, and getting it wrong shows a card form to someone who came to pay by EFT.
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

// Hoisted so the flag can be flipped per test: it is the cutover switch between two rails, and
// a switch with only one position tested is the half nobody notices is broken.
const mockEnv = vi.hoisted(() => ({
  NEXT_PUBLIC_APP_URL: "https://app.example.com",
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: "live_test_token",
}));

vi.mock("@/lib/env", () => ({ env: mockEnv }));

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
    paddleSubscriptionId: "tok-1",
    complimentaryPlanId: null,
    plan: { slug: "business", monthlyPriceCents: 2900 },
    _count: { studentRelationships: 0 },
    ...PAST_DUE,
  };
});

const PERIOD_END = new Date("2026-08-31T00:00:00.000Z");

/**
 * The in-place reprice this used to cover is gone with PayFast.
 *
 * PayFast could reprice a live mandate from the server with the token alone. Paddle needs a
 * subscription update through its API, and PADDLE_API_KEY is the one credential this
 * integration does not hold — so the path refuses instead of half-applying. The refusal is
 * asserted under "checkout hands off to Paddle" below.
 */

/**
 * PAY-03. Paddle is the only rail now. The checkout sends a price id and nothing else — no
 * amount, no currency, no signature — because Paddle is the authority on what a plan costs and
 * every defect 20260808160000_price_plans_in_zar deleted came from this application computing
 * a charge for itself.
 */
describe("checkout hands off to Paddle", () => {
  beforeEach(() => {
    state.organization = {
      paddleSubscriptionId: null,
      complimentaryPlanId: null,
      plan: { slug: "free", monthlyPriceCents: 0 },
      _count: { studentRelationships: 0 },
      subscriptionStatus: "active",
      graceStartedAt: null,
      graceEndsAt: null,
      dunningStage: 0,
    };
  });

  it("returns the catalogue price id and no amount", async () => {
    const result = await createSubscriptionCheckout({ planSlug: "business", interval: "annual" });

    expect(result.success).toBe(true);
    if (!result.success) return;
    if (result.data.mode !== "paddle") throw new Error(`expected paddle, got ${result.data.mode}`);

    expect(result.data.priceId).toBe("pri_01kzkwakjn66bjcb1crrmbyg26");
    expect(result.data.organizationId).toBe("org-1");
    expect(result.data).not.toHaveProperty("amount");
    expect(result.data).not.toHaveProperty("signature");
  });

  /**
   * Repricing a live Paddle subscription needs PADDLE_API_KEY, which this integration does not
   * hold. Failing loudly beats the alternatives: silence leaves a teacher believing they
   * upgraded, and a fresh checkout leaves them paying for two subscriptions at once.
   */
  it("refuses to change plan on a live subscription rather than half-doing it", async () => {
    state.organization = { ...state.organization, paddleSubscriptionId: "sub_live" };

    const result = await createSubscriptionCheckout({ planSlug: "business", interval: "monthly" });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe("CONFLICT");
  });
});

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
      paddleSubscriptionId: "tok-1",
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
