import { describe, expect, it } from "vitest";

import {
  addDays,
  graceAgeDays,
  growthBlockMessage,
  isGrowthBlocked,
  nextDunningStage,
  startPaidTrial,
  startPaymentGrace,
} from "./lifecycle";

const NOW = new Date("2026-07-19T12:00:00.000Z");

describe("subscription lifecycle", () => {
  it("grants an explicit fourteen-day paid trial", () => {
    const trial = startPaidTrial(NOW);
    expect(trial.subscriptionStatus).toBe("trialing");
    expect(trial.trialEndsAt).toEqual(addDays(NOW, 14));
  });

  it("starts a fourteen-day grace period", () => {
    const grace = startPaymentGrace(NOW);
    expect(grace.subscriptionStatus).toBe("past_due");
    expect(grace.graceEndsAt).toEqual(addDays(NOW, 14));
    expect(grace.dunningStage).toBe(0);
  });

  it("emits dunning stages on days zero, three, and six only once", () => {
    expect(nextDunningStage(NOW, 0, NOW)).toBe(1);
    expect(nextDunningStage(NOW, 1, addDays(NOW, 2))).toBeNull();
    expect(nextDunningStage(NOW, 1, addDays(NOW, 3))).toBe(2);
    expect(nextDunningStage(NOW, 2, addDays(NOW, 6))).toBe(3);
    expect(nextDunningStage(NOW, 3, addDays(NOW, 20))).toBeNull();
  });

  it("blocks growth after seven past-due days but preserves it before then", () => {
    const state = {
      subscriptionStatus: "past_due" as const,
      trialEndsAt: null,
      graceStartedAt: NOW,
      graceEndsAt: addDays(NOW, 14),
    };
    expect(graceAgeDays(NOW, addDays(NOW, 6))).toBe(6);
    expect(isGrowthBlocked(state, addDays(NOW, 6))).toBe(false);
    expect(isGrowthBlocked(state, addDays(NOW, 7))).toBe(true);
    expect(growthBlockMessage(state, addDays(NOW, 7))).toContain("Existing lessons");
  });

  it("blocks expired trials and cancelled subscriptions", () => {
    expect(
      isGrowthBlocked(
        {
          subscriptionStatus: "trialing",
          trialEndsAt: NOW,
          graceStartedAt: null,
          graceEndsAt: null,
        },
        NOW,
      ),
    ).toBe(true);
    expect(
      isGrowthBlocked({
        subscriptionStatus: "cancelled",
        trialEndsAt: null,
        graceStartedAt: null,
        graceEndsAt: null,
      }),
    ).toBe(true);
  });
});
