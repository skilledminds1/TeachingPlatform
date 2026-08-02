import { describe, expect, it } from "vitest";

import {
  addDays,
  graceAgeDays,
  growthBlockMessage,
  isGrowthBlocked,
  nextDunningStage,
  startPaymentGrace,
} from "./lifecycle";

const NOW = new Date("2026-07-19T12:00:00.000Z");

describe("subscription lifecycle", () => {
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
      graceStartedAt: NOW,
      graceEndsAt: addDays(NOW, 14),
    };
    expect(graceAgeDays(NOW, addDays(NOW, 6))).toBe(6);
    expect(isGrowthBlocked(state, addDays(NOW, 6))).toBe(false);
    expect(isGrowthBlocked(state, addDays(NOW, 7))).toBe(true);
    expect(growthBlockMessage(state, addDays(NOW, 7))).toContain("Existing lessons");
  });

  it("blocks cancelled subscriptions", () => {
    expect(
      isGrowthBlocked({
        subscriptionStatus: "cancelled",
        graceStartedAt: null,
        graceEndsAt: null,
      }),
    ).toBe(true);
  });
});
