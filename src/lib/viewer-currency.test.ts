import { describe, expect, it } from "vitest";

import { currencyForLocale, currencyForRegion } from "./viewer-currency";

describe("currencyForRegion", () => {
  it("maps regions to their currency", () => {
    expect(currencyForRegion("GB")).toBe("GBP");
    expect(currencyForRegion("JP")).toBe("JPY");
    expect(currencyForRegion("BR")).toBe("BRL");
    expect(currencyForRegion("PH")).toBe("PHP");
  });

  it("maps every eurozone member to EUR", () => {
    for (const region of ["DE", "FR", "IE", "NL", "PT", "ES", "IT"]) {
      expect(currencyForRegion(region), `${region} should be EUR`).toBe("EUR");
    }
  });

  it("is case-insensitive", () => {
    expect(currencyForRegion("gb")).toBe("GBP");
  });

  it("returns null for an unmapped or missing region", () => {
    expect(currencyForRegion("ZZ")).toBeNull();
    expect(currencyForRegion(null)).toBeNull();
    expect(currencyForRegion("")).toBeNull();
  });
});

describe("currencyForLocale", () => {
  it("derives the currency from the locale's region", () => {
    expect(currencyForLocale("en-GB")).toBe("GBP");
    expect(currencyForLocale("ja-JP")).toBe("JPY");
    expect(currencyForLocale("pt-BR")).toBe("BRL");
    expect(currencyForLocale("de-AT")).toBe("EUR");
  });

  // The important negative case: language alone cannot imply a currency. "en" could be a
  // dozen of them, and defaulting English speakers to dollars would quietly mislead most
  // of them.
  it("returns null for a locale with no region", () => {
    expect(currencyForLocale("en")).toBeNull();
    expect(currencyForLocale("es")).toBeNull();
  });

  it("handles underscore-separated and extended tags", () => {
    expect(currencyForLocale("en_GB")).toBe("GBP");
    expect(currencyForLocale("zh-Hant-TW")).toBe("TWD");
  });

  it("returns null for junk rather than throwing", () => {
    expect(currencyForLocale("")).toBeNull();
    expect(currencyForLocale(null)).toBeNull();
    expect(currencyForLocale("!!!not a locale!!!")).toBeNull();
  });
});
