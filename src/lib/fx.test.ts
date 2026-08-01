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

  it("converts every supported currency to a plausible USD figure", () => {
    for (const item of LESSON_CURRENCIES) {
      const usd = toUsdCents(10_000, item.code);
      expect(usd, `${item.code} should convert`).not.toBeNull();
      // Sanity band: no supported currency is more than ~2x or less than ~0.5x the dollar.
      expect(usd!).toBeGreaterThan(4_000);
      expect(usd!).toBeLessThan(20_000);
    }
  });

  it("returns null rather than guessing for an unknown currency", () => {
    expect(toUsdCents(5000, "ZAR")).toBeNull();
    expect(toUsdCents(5000, "JPY")).toBeNull();
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

describe("migration backfill stays in sync with fx.ts", () => {
  /**
   * The backfill hard-codes the same rates in SQL, because a migration cannot import
   * application code. If someone updates one and not the other, existing rows silently
   * disagree with newly-saved ones — so assert they match.
   */
  it("uses the same rate for every currency as the runtime table", () => {
    const sql = readFileSync(
      "prisma/migrations/20260731050000_normalised_hourly_rate/migration.sql",
      "utf8",
    );

    for (const currency of convertibleCurrencies()) {
      const match = new RegExp(`WHEN '${currency}' THEN ([0-9.]+)`).exec(sql);
      expect(match, `migration is missing a rate for ${currency}`).not.toBeNull();
      expect(
        Number(match![1]),
        `${currency}: migration and fx.ts disagree`,
      ).toBeCloseTo(usdRate(currency)!, 6);
    }
  });
});
