import { describe, expect, it } from "vitest";

import { applyPercentOff, getEffectivePlanPrice, type ActiveSale } from "./pricing";

/**
 * A sale the checkout cannot charge must not be advertised.
 *
 * When PayFast was the rail, this application computed the charge itself, so percentOff alone
 * was enough to make a discount real. Paddle takes a discount id or nothing — a percentage it
 * has never heard of buys nothing at the till. Sales briefly survived that change as
 * display-only: the plan card said "30% off" and the checkout charged list price.
 *
 * That is the worst shape a pricing bug takes. It is silent, it is visible to the customer,
 * and the first person to notice is the one who has already paid.
 */
const PLAN = { id: "plan-business", monthlyPriceCents: 4900, annualPriceCents: 49000 };

function sale(overrides: Partial<ActiveSale> = {}): ActiveSale {
  return {
    id: "sale-1",
    name: "Launch weekend",
    paddleDiscountId: "dsc_launch",
    percentOff: 30,
    endsAt: new Date("2026-12-31T00:00:00.000Z"),
    intervalScope: "both",
    ...overrides,
  };
}

describe("a sale that can actually be charged", () => {
  it("discounts the price and reports the sale", () => {
    const priced = getEffectivePlanPrice(PLAN, "monthly", sale());

    expect(priced.listCents).toBe(4900);
    expect(priced.effectiveCents).toBe(applyPercentOff(4900, 30));
    expect(priced.percentOff).toBe(30);
    expect(priced.sale?.paddleDiscountId).toBe("dsc_launch");
  });

  it("respects the interval it was scoped to", () => {
    const annualOnly = sale({ intervalScope: "annual" });

    expect(getEffectivePlanPrice(PLAN, "annual", annualOnly).percentOff).toBe(30);
    expect(getEffectivePlanPrice(PLAN, "monthly", annualOnly).percentOff).toBe(0);
  });
});

describe("a sale with no Paddle discount behind it", () => {
  /**
   * The assertion that matters. Reporting percentOff here is what put a badge on a card next
   * to a button that charges full price.
   */
  it("is reported as no sale at all, so nothing advertises it", () => {
    const priced = getEffectivePlanPrice(PLAN, "monthly", sale({ paddleDiscountId: null }));

    expect(priced.percentOff).toBe(0);
    expect(priced.effectiveCents).toBe(4900);
    expect(priced.sale).toBeNull();
  });

  it("charges list price rather than the discounted one", () => {
    const undiscountable = sale({ paddleDiscountId: null, percentOff: 90 });

    expect(getEffectivePlanPrice(PLAN, "annual", undiscountable).effectiveCents).toBe(49000);
  });
});

describe("no sale at all", () => {
  it("leaves the price alone", () => {
    for (const missing of [null, undefined]) {
      const priced = getEffectivePlanPrice(PLAN, "monthly", missing);
      expect(priced.effectiveCents).toBe(4900);
      expect(priced.percentOff).toBe(0);
      expect(priced.sale).toBeNull();
    }
  });
});
