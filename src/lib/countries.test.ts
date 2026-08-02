import { describe, expect, it } from "vitest";

import {
  COUNTRY_CODES,
  countryName,
  countryOptions,
  isCountryCode,
  toCountryCode,
} from "./countries";
import {
  isRestrictedJurisdiction,
  RESTRICTED_JURISDICTIONS,
} from "./compliance/restricted-jurisdictions";
import { countryForTimeZone, mappedTimeZones } from "./timezone-country";

describe("country codes", () => {
  it("holds the assigned ISO 3166-1 alpha-2 set, unique and sorted", () => {
    expect(COUNTRY_CODES).toHaveLength(249);
    expect(new Set(COUNTRY_CODES).size).toBe(COUNTRY_CODES.length);
    expect([...COUNTRY_CODES]).toEqual([...COUNTRY_CODES].sort());
  });

  it("recognises codes case-insensitively", () => {
    expect(isCountryCode("ZA")).toBe(true);
    expect(isCountryCode("za")).toBe(true);
    expect(toCountryCode(" ph ")).toBe("PH");
  });

  it("rejects anything that is not a country", () => {
    expect(isCountryCode("XX")).toBe(false);
    expect(isCountryCode("")).toBe(false);
    expect(isCountryCode(null)).toBe(false);
    expect(toCountryCode(42)).toBeNull();
  });

  /**
   * Names are derived from ICU rather than tabulated precisely so renames arrive on their
   * own. A hardcoded list would still say Turkey, Swaziland and Czech Republic.
   */
  it("takes current names from ICU rather than a stale table", () => {
    expect(countryName("TR")).toBe("Türkiye");
    expect(countryName("SZ")).toBe("Eswatini");
    expect(countryName("CZ")).toBe("Czechia");
  });

  it("falls back to the code rather than throwing on junk", () => {
    expect(countryName("XX")).toBe("XX");
  });

  it("offers every country sorted by name for a select", () => {
    const options = countryOptions();
    expect(options).toHaveLength(COUNTRY_CODES.length);
    expect(options.map((o) => o.name)).toEqual(
      [...options.map((o) => o.name)].sort((a, b) => a.localeCompare(b, "en")),
    );
  });
});

describe("restricted jurisdictions", () => {
  it("blocks the comprehensively sanctioned countries", () => {
    for (const code of ["CU", "IR", "KP", "SY"]) {
      expect(isRestrictedJurisdiction(code), `${code} should be blocked`).toBe(true);
    }
    expect(isRestrictedJurisdiction("cu")).toBe(true);
  });

  it("does not block ordinary markets", () => {
    for (const code of ["ZA", "GB", "US", "PH", "JP", "BR", "IN"]) {
      expect(isRestrictedJurisdiction(code), `${code} must not be blocked`).toBe(false);
    }
  });

  /**
   * An unknown country is a DIFFERENT failure — a missing or unparseable field — handled by
   * requiring a valid country at registration. Blocking on "unknown" would refuse people
   * whose input merely failed to parse.
   */
  it("does not block on missing or unrecognised input", () => {
    expect(isRestrictedJurisdiction(null)).toBe(false);
    expect(isRestrictedJurisdiction("")).toBe(false);
    expect(isRestrictedJurisdiction("XX")).toBe(false);
  });

  it("lists only real country codes", () => {
    for (const code of RESTRICTED_JURISDICTIONS) {
      expect(isCountryCode(code), `${code} must be a real country`).toBe(true);
    }
  });
});

describe("country from timezone", () => {
  it("resolves the common zones", () => {
    expect(countryForTimeZone("Europe/London")).toBe("GB");
    expect(countryForTimeZone("America/Los_Angeles")).toBe("US");
    expect(countryForTimeZone("Asia/Manila")).toBe("PH");
    expect(countryForTimeZone("Africa/Johannesburg")).toBe("ZA");
    expect(countryForTimeZone("Asia/Tokyo")).toBe("JP");
  });

  // A guess, not evidence — an unmapped zone leaves the field empty for the user to fill.
  it("returns null rather than guessing for an unmapped or missing zone", () => {
    expect(countryForTimeZone("Antarctica/Troll")).toBeNull();
    expect(countryForTimeZone(null)).toBeNull();
    expect(countryForTimeZone("")).toBeNull();
    expect(countryForTimeZone("Not/AZone")).toBeNull();
  });

  it("only ever maps to real country codes", () => {
    for (const zone of mappedTimeZones()) {
      const code = countryForTimeZone(zone);
      expect(code, `${zone} must map to a real country`).not.toBeNull();
      expect(isCountryCode(code!)).toBe(true);
    }
  });

  it("covers every zone the onboarding picker offers", async () => {
    const { TIMEZONE_OPTIONS } = await import("./timezone");
    const uncovered = TIMEZONE_OPTIONS.map((option) => option.value).filter(
      (zone) => countryForTimeZone(zone) === null,
    );
    expect(uncovered, `unmapped zones: ${uncovered.join(", ")}`).toEqual([]);
  });
});
