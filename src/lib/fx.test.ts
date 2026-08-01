import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { LESSON_CURRENCIES } from "./currencies";
import {
  convertibleCurrencies,
  isConvertibleCurrency,
  toUsdCents,
  toUsdCentsForRanking,
  usdRate,
} from "./fx";

describe("toUsdCents", () => {
  it("leaves USD untouched", () => {
    expect(toUsdCents(5000, "USD")).toBe(5000);
  });

  // INT-12: the exact case that made the filter wrong. £45 is about $57, so it belongs
  // OUTSIDE an "Up to $50/hour" bucket — the old comparison put it inside, because it
  // compared 4500 against 5000 as if both were dollars.
  it("places a GBP 45 teacher above the $50 bucket, where they belong", () => {
    const usd = toUsdCents(4500, "GBP");
    expect(usd).not.toBeNull();
    expect(usd!).toBeGreaterThan(5000);
  });

  // INT-09: this used to assert a "no more than ~2x or ~0.5x the dollar" band, which held
  // only while the list was five western currencies. With PHP and JPY on it the band is
  // meaningless — 10,000 minor units is $1.63 in pesos and $62 in yen. What is actually
  // worth asserting is that every offered currency converts to a positive finite figure.
  it("converts every supported currency to a positive USD figure", () => {
    for (const item of LESSON_CURRENCIES) {
      const usd = toUsdCents(10_000, item.code);
      expect(usd, `${item.code} should convert`).not.toBeNull();
      expect(Number.isFinite(usd!), `${item.code} should be finite`).toBe(true);
      expect(usd!, `${item.code} should be positive`).toBeGreaterThan(0);
    }
  });

  /**
   * INT-09: the conversion applied the rate straight to the minor-unit integer, which
   * assumed every currency shared USD's two decimal digits. A ¥8,000 lesson is 8000 minor
   * units, so the old maths gave 8000/160.24 = 50 cents and ranked that teacher at $0.50 an
   * hour — dead last in "price: low to high" on a marketplace they should have sat mid-table
   * on. The exponent has to enter on both sides of the conversion.
   */
  it("accounts for a zero-decimal currency's exponent when ranking", () => {
    const usd = toUsdCents(8000, "JPY");
    expect(usd).not.toBeNull();
    // ¥8,000 is roughly $50, not $0.50.
    expect(usd!).toBeGreaterThan(3_000);
    expect(usd!).toBeLessThan(8_000);
  });

  it("returns null rather than guessing for an unknown currency", () => {
    expect(toUsdCents(5000, "ZAR")).toBeNull();
    expect(toUsdCents(5000, "INR")).toBeNull();
  });

  it("is case-insensitive about the currency code", () => {
    expect(toUsdCents(5000, "gbp")).toBe(toUsdCents(5000, "GBP"));
  });

  it("rejects a non-finite amount", () => {
    expect(toUsdCents(Number.NaN, "USD")).toBeNull();
  });
});

describe("toUsdCentsForRanking", () => {
  // On write, refusing to store anything would hide the teacher from price filtering
  // entirely — worse than ranking them roughly.
  it("falls back to treating an unknown currency as USD", () => {
    expect(toUsdCentsForRanking(5000, "ZAR")).toBe(5000);
    expect(toUsdCentsForRanking(5000, "not-a-currency")).toBe(5000);
  });

  it("converts normally for a known currency", () => {
    expect(toUsdCentsForRanking(4500, "GBP")).toBe(toUsdCents(4500, "GBP"));
  });
});

describe("currency coverage", () => {
  it("can rank every currency the marketplace offers", () => {
    for (const item of LESSON_CURRENCIES) {
      expect(isConvertibleCurrency(item.code), `${item.code} needs a rate`).toBe(true);
    }
  });

  it("does not claim to convert a currency that is no longer offered", () => {
    expect(isConvertibleCurrency("ZAR")).toBe(false);
  });
});

describe("static rate table covers the offered currencies", () => {
  /**
   * INT-09: the drift that actually costs something.
   *
   * `toUsdCentsForRanking` deliberately falls back to treating an unrecognised currency as
   * already-USD, because hiding a teacher from price filtering is worse than ranking them
   * roughly. That fallback is a trap when a currency is added to LESSON_CURRENCIES and not
   * to STATIC_USD_RATES: a ¥8,000 teacher is silently ranked at $8,000 an hour and never
   * appears in a sane price bucket again. Nothing else would fail.
   */
  it("has a fallback rate for every currency a teacher can select", () => {
    const rated = new Set(convertibleCurrencies());
    for (const item of LESSON_CURRENCIES) {
      expect(rated.has(item.code), `${item.code} needs a rate in STATIC_USD_RATES`).toBe(true);
      expect(usdRate(item.code), `${item.code} rate must be positive`).toBeGreaterThan(0);
    }
  });

  /**
   * The INT-12 backfill hard-codes rates in SQL, because a migration cannot import
   * application code. It is a FROZEN historical artifact: it ran once, against the five
   * currencies and the rates that existed on 2026-07-31, and an applied migration is not
   * edited. This used to assert that it still agreed with fx.ts exactly, which quietly made
   * every future rate review a failing test — and the agreement it protected no longer
   * matters, because the INT-11 cron re-normalises every profile daily from the live table.
   * What is still worth asserting is that the backfill happened at all.
   */
  it("still backfills the currencies that existed when it ran", () => {
    const sql = readFileSync(
      "prisma/migrations/20260731050000_normalised_hourly_rate/migration.sql",
      "utf8",
    );

    for (const currency of ["USD", "EUR", "GBP", "AUD", "CAD"]) {
      expect(
        new RegExp(`WHEN '${currency}' THEN ([0-9.]+)`).test(sql),
        `migration is missing a rate for ${currency}`,
      ).toBe(true);
    }
    // Unrecognised currencies fall back to USD rather than being dropped.
    expect(sql).toContain("ELSE 1.00");
  });
});
