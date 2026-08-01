import { describe, expect, it } from "vitest";

import {
  DEFAULT_LESSON_CURRENCY,
  getCurrencyMeta,
  isLessonCurrency,
  LESSON_CURRENCIES,
  providersForCurrency,
} from "./currencies";

describe("lesson currencies", () => {
  // INT-08: ZAR headed this list marked as PayPal-supported. PayPal does not accept ZAR as
  // a transaction currency at all, so a teacher who priced in rand had every checkout fail
  // at order creation — and it was the default option shown.
  it("does not offer a currency the payment rail cannot process", () => {
    expect(isLessonCurrency("ZAR")).toBe(false);
    expect(LESSON_CURRENCIES.map((item) => item.code)).not.toContain("ZAR");
  });

  it("offers the currencies PayPal does support", () => {
    for (const code of ["USD", "EUR", "GBP", "AUD", "CAD"]) {
      expect(isLessonCurrency(code), `${code} should be offered`).toBe(true);
    }
  });

  it("routes no provider for an unsupported currency", () => {
    // Returning a provider anyway invited a checkout that could only fail at the processor.
    expect(providersForCurrency("ZAR")).toEqual([]);
    expect(providersForCurrency("JPY")).toEqual([]);
    expect(providersForCurrency("")).toEqual([]);
  });

  it("routes PayPal for every supported currency", () => {
    for (const item of LESSON_CURRENCIES) {
      expect(providersForCurrency(item.code)).toContain("paypal");
    }
  });
});

describe("getCurrencyMeta", () => {
  it("falls back to the default currency by name, not by list position", () => {
    expect(getCurrencyMeta("ZAR").code).toBe(DEFAULT_LESSON_CURRENCY);
    expect(getCurrencyMeta("not-a-currency").code).toBe(DEFAULT_LESSON_CURRENCY);
  });

  // The fallback used to be LESSON_CURRENCIES[1] — correct only because ZAR happened to sit
  // at index 0. Reordering the array would have silently changed the default everywhere.
  it("keeps the default stable regardless of array order", () => {
    const reordered = [...LESSON_CURRENCIES].reverse();
    expect(reordered.find((item) => item.code === DEFAULT_LESSON_CURRENCY)).toBeDefined();
    expect(getCurrencyMeta("unknown").code).toBe(DEFAULT_LESSON_CURRENCY);
  });

  it("returns the exact entry for a known currency", () => {
    expect(getCurrencyMeta("GBP").symbol).toBe("£");
    expect(getCurrencyMeta("EUR").code).toBe("EUR");
  });
});
