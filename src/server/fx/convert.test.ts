import { describe, expect, it } from "vitest";

import {
  convertMinorUnits,
  indicativeAmount,
  toUsdMinorUnits,
  type ConversionContext,
} from "./convert";

/** Units per 1 USD, matching the shape the live table produces. */
const context: ConversionContext = {
  rates: { USD: 1, EUR: 0.87, GBP: 0.745, JPY: 147, AUD: 1.42 },
  asOf: new Date("2026-07-31T00:00:00.000Z"),
  stale: false,
};

describe("convertMinorUnits", () => {
  it("returns the same amount when the currencies match", () => {
    expect(convertMinorUnits(2500, "GBP", "GBP", context)).toBe(2500);
  });

  it("routes through USD in both directions", () => {
    // £25 -> USD -> JPY. 2500 / 0.745 * 147 ≈ 493,289 minor units.
    const jpy = convertMinorUnits(2500, "GBP", "JPY", context);
    expect(jpy).toBeGreaterThan(400_000);
    expect(jpy).toBeLessThan(600_000);
  });

  it("round-trips back to approximately the original amount", () => {
    const toEur = convertMinorUnits(10_000, "USD", "EUR", context)!;
    const back = convertMinorUnits(toEur, "EUR", "USD", context)!;
    expect(Math.abs(back - 10_000)).toBeLessThanOrEqual(2);
  });

  it("returns null when either rate is unknown, rather than guessing", () => {
    expect(convertMinorUnits(1000, "USD", "XYZ", context)).toBeNull();
    expect(convertMinorUnits(1000, "XYZ", "USD", context)).toBeNull();
  });

  it("rejects a non-finite amount", () => {
    expect(convertMinorUnits(Number.NaN, "USD", "EUR", context)).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(convertMinorUnits(1000, "gbp", "usd", context)).toBe(
      convertMinorUnits(1000, "GBP", "USD", context),
    );
  });
});

describe("toUsdMinorUnits", () => {
  it("normalises a GBP price to more USD than its face value", () => {
    // The INT-12 case: £45 is about $60, so it must not compare as 4500.
    const usd = toUsdMinorUnits(4500, "GBP", context)!;
    expect(usd).toBeGreaterThan(5000);
  });
});

describe("indicativeAmount", () => {
  const base = { amountMinorUnits: 2500, from: "GBP", context };

  it("converts for a viewer in a different currency", () => {
    const result = indicativeAmount({ ...base, viewerCurrency: "JPY" });
    expect(result?.currency).toBe("JPY");
    expect(result!.amount).toBeGreaterThan(0);
  });

  // Each of these is a case where showing nothing beats showing a number a student might
  // budget against and find wrong at checkout.
  it("shows nothing when the viewer currency matches the teacher's", () => {
    expect(indicativeAmount({ ...base, viewerCurrency: "GBP" })).toBeNull();
    expect(indicativeAmount({ ...base, viewerCurrency: "gbp" })).toBeNull();
  });

  it("shows nothing when the viewer currency is unknown", () => {
    expect(indicativeAmount({ ...base, viewerCurrency: null })).toBeNull();
    expect(indicativeAmount({ ...base, viewerCurrency: "XYZ" })).toBeNull();
  });

  it("shows nothing when the rate table is stale", () => {
    expect(
      indicativeAmount({
        ...base,
        viewerCurrency: "JPY",
        context: { ...context, stale: true },
      }),
    ).toBeNull();
  });
});
