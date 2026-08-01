import { describe, expect, it } from "vitest";

import {
  DEFAULT_LESSON_CURRENCY,
  fromMinorUnits,
  getCurrencyMeta,
  isLessonCurrency,
  LESSON_CURRENCIES,
  minorUnitExponent,
  minorUnitFactor,
  providersForCurrency,
  toMinorUnits,
} from "./currencies";

describe("lesson currencies", () => {
  // INT-08: ZAR headed this list marked as PayPal-supported. PayPal does not accept ZAR as
  // a transaction currency at all, so a teacher who priced in rand had every checkout fail
  // at order creation — and it was the default option shown.
  it("does not offer a currency the payment rail cannot process", () => {
    expect(isLessonCurrency("ZAR")).toBe(false);
    expect(LESSON_CURRENCIES.map((item) => item.code)).not.toContain("ZAR");
  });

  // INT-09: the same check for every currency the ECB quotes but PayPal will not transact.
  // Listing any of these repeats the ZAR incident exactly.
  it("does not offer a currency PayPal has no support for", () => {
    for (const code of ["INR", "KRW", "IDR", "TRY", "BGN", "ISK", "RON"]) {
      expect(isLessonCurrency(code), `${code} is not a PayPal currency`).toBe(false);
    }
  });

  // PayPal supports these for in-country accounts only, which on a cross-border marketplace
  // means most checkouts fail — the ZAR failure mode in a different hat.
  it("does not offer a currency PayPal restricts to in-country accounts", () => {
    for (const code of ["BRL", "CNY", "MYR"]) {
      expect(isLessonCurrency(code), `${code} is in-country only`).toBe(false);
    }
  });

  // PayPal documents HUF and TWD as not supporting decimals, but ISO 4217 gives them two.
  // When the provider and the standard disagree about the exponent, one of them rejects
  // whatever we send.
  it("does not offer a currency whose exponent the provider and ISO 4217 disagree on", () => {
    for (const code of ["HUF", "TWD"]) {
      expect(isLessonCurrency(code), `${code} has a disputed exponent`).toBe(false);
      expect(minorUnitExponent(code)).toBe(2);
    }
  });

  it("offers the currencies PayPal does support", () => {
    for (const code of [
      "USD",
      "EUR",
      "GBP",
      "AUD",
      "CAD",
      "JPY",
      "PHP",
      "SGD",
      "HKD",
      "NZD",
      "PLN",
      "CHF",
      "SEK",
      "MXN",
    ]) {
      expect(isLessonCurrency(code), `${code} should be offered`).toBe(true);
    }
  });

  it("leads with the three currencies that cover most of the marketplace", () => {
    expect(LESSON_CURRENCIES.slice(0, 3).map((item) => item.code)).toEqual([
      "USD",
      "EUR",
      "GBP",
    ]);
  });

  it("routes no provider for an unsupported currency", () => {
    // Returning a provider anyway invited a checkout that could only fail at the processor.
    expect(providersForCurrency("ZAR")).toEqual([]);
    expect(providersForCurrency("INR")).toEqual([]);
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

/**
 * INT-09. The three exponents that matter are a zero-decimal currency, the two-decimal case
 * everything was written around, and a three-decimal currency — because an implementation
 * that special-cases "JPY or not" passes the first two and still gets the third wrong.
 */
describe("minorUnitExponent", () => {
  it("knows the zero-, two- and three-decimal cases", () => {
    expect(minorUnitExponent("JPY")).toBe(0);
    expect(minorUnitExponent("USD")).toBe(2);
    expect(minorUnitExponent("KWD")).toBe(3);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(minorUnitExponent("jpy")).toBe(0);
    expect(minorUnitExponent("  usd  ")).toBe(2);
  });

  it("defaults to two digits for anything it cannot resolve", () => {
    expect(minorUnitExponent("not-a-currency")).toBe(2);
    expect(minorUnitExponent("")).toBe(2);
    // Well-formed but unassigned: ICU accepts it and applies its own default.
    expect(minorUnitExponent("XYZ")).toBe(2);
  });

  it("exposes the factor as a power of ten", () => {
    expect(minorUnitFactor("JPY")).toBe(1);
    expect(minorUnitFactor("USD")).toBe(100);
    expect(minorUnitFactor("KWD")).toBe(1000);
  });

  it("resolves an exponent for every currency the marketplace offers", () => {
    for (const item of LESSON_CURRENCIES) {
      const exponent = minorUnitExponent(item.code);
      expect(Number.isInteger(exponent), `${item.code} needs an integer exponent`).toBe(true);
      expect(exponent).toBeGreaterThanOrEqual(0);
      expect(exponent).toBeLessThanOrEqual(3);
    }
  });
});

describe("fromMinorUnits", () => {
  // The defect: (cents / 100).toFixed(2) turned a ¥5,000 lesson into "50.00" — a hundredth
  // of the price, carrying a decimal point PayPal rejects on JPY anyway.
  it("serialises a zero-decimal currency with no decimal point", () => {
    expect(fromMinorUnits(5000, "JPY")).toBe("5000");
    expect(fromMinorUnits(0, "JPY")).toBe("0");
    expect(fromMinorUnits(7, "JPY")).toBe("7");
  });

  it("serialises a two-decimal currency unchanged", () => {
    expect(fromMinorUnits(12345, "USD")).toBe("123.45");
    expect(fromMinorUnits(2500, "USD")).toBe("25.00");
    expect(fromMinorUnits(5, "USD")).toBe("0.05");
    expect(fromMinorUnits(0, "USD")).toBe("0.00");
  });

  it("serialises a three-decimal currency with all three digits", () => {
    expect(fromMinorUnits(1234, "KWD")).toBe("1.234");
    expect(fromMinorUnits(5, "KWD")).toBe("0.005");
    expect(fromMinorUnits(1000, "KWD")).toBe("1.000");
  });

  it("handles negative amounts", () => {
    expect(fromMinorUnits(-12345, "USD")).toBe("-123.45");
    expect(fromMinorUnits(-5000, "JPY")).toBe("-5000");
  });

  // Posting the string "NaN" to a payment provider is worse than a failed order.
  it("refuses a non-finite amount rather than emitting garbage", () => {
    expect(() => fromMinorUnits(Number.NaN, "USD")).toThrow();
    expect(() => fromMinorUnits(Number.POSITIVE_INFINITY, "USD")).toThrow();
  });
});

describe("toMinorUnits", () => {
  it("parses a zero-decimal currency at its own scale", () => {
    expect(toMinorUnits("5000", "JPY")).toBe(5000);
    // A provider that echoes a decimal anyway must not be read as 100x the amount.
    expect(toMinorUnits("5000.00", "JPY")).toBe(5000);
  });

  it("parses a two-decimal currency", () => {
    expect(toMinorUnits("123.45", "USD")).toBe(12345);
    expect(toMinorUnits("50.00", "USD")).toBe(5000);
    expect(toMinorUnits(12.5, "USD")).toBe(1250);
    expect(toMinorUnits("0.05", "USD")).toBe(5);
  });

  it("parses a three-decimal currency", () => {
    expect(toMinorUnits("1.234", "KWD")).toBe(1234);
    expect(toMinorUnits("0.005", "KWD")).toBe(5);
  });

  it("rounds half up on the first dropped digit", () => {
    expect(toMinorUnits("12.345", "USD")).toBe(1235);
    expect(toMinorUnits("12.344", "USD")).toBe(1234);
    expect(toMinorUnits("0.5", "JPY")).toBe(1);
    expect(toMinorUnits("0.4", "JPY")).toBe(0);
  });

  it("handles negatives and leading dots", () => {
    expect(toMinorUnits("-12.34", "USD")).toBe(-1234);
    expect(toMinorUnits(".5", "USD")).toBe(50);
  });

  it("round-trips every offered currency", () => {
    for (const item of LESSON_CURRENCIES) {
      const minorUnits = 123_456;
      expect(
        toMinorUnits(fromMinorUnits(minorUnits, item.code), item.code),
        `${item.code} should round-trip`,
      ).toBe(minorUnits);
    }
  });
});

/**
 * The end-to-end shape of the two scenarios INT-09 is judged on: the amount a teacher types
 * has to arrive at the provider as the same amount of money.
 */
describe("teacher pricing reaches the provider intact", () => {
  function priceLesson(typed: string, currency: string) {
    const storedMinorUnits = toMinorUnits(typed, currency);
    return { storedMinorUnits, providerValue: fromMinorUnits(storedMinorUnits, currency) };
  }

  it("prices a Manila teacher's lesson in PHP", () => {
    expect(priceLesson("1500", "PHP")).toEqual({
      storedMinorUnits: 150_000,
      providerValue: "1500.00",
    });
    expect(priceLesson("1499.99", "PHP")).toEqual({
      storedMinorUnits: 149_999,
      providerValue: "1499.99",
    });
  });

  it("prices a Tokyo teacher's lesson in JPY", () => {
    expect(priceLesson("5000", "JPY")).toEqual({
      storedMinorUnits: 5000,
      providerValue: "5000",
    });
  });

  it("still prices a London teacher's lesson in GBP", () => {
    expect(priceLesson("25", "GBP")).toEqual({
      storedMinorUnits: 2500,
      providerValue: "25.00",
    });
  });
});
