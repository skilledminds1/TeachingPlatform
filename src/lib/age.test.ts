import { describe, expect, it } from "vitest";

import { ageInYears, isMinor, isPlausibleDateOfBirth, minorDateOfBirthCutoff } from "./age";

/**
 * The boundary is the whole point. Everything this file guards turns on whether one specific
 * person is 17 or 18 on one specific day, and a day-arithmetic shortcut gets that wrong twice
 * a year — once on leap years and once either side of every birthday.
 */

const NOW = new Date("2026-08-08T12:00:00.000Z");
const dob = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("ageInYears", () => {
  it("counts the birthday itself as the new age", () => {
    expect(ageInYears(dob("2008-08-08"), NOW)).toBe(18);
  });

  it("does not count a birthday that has not arrived", () => {
    expect(ageInYears(dob("2008-08-09"), NOW)).toBe(17);
  });

  it("counts a birthday that passed yesterday", () => {
    expect(ageInYears(dob("2008-08-07"), NOW)).toBe(18);
  });

  it("handles a later month in the same year", () => {
    expect(ageInYears(dob("2008-12-31"), NOW)).toBe(17);
  });

  it("handles a 29 February birth date in a non-leap year", () => {
    // Born 2008-02-29; on 2026-08-08 they have had eighteen 1 March boundaries pass.
    expect(ageInYears(dob("2008-02-29"), NOW)).toBe(18);
  });

  it("does not drift on a leap-heavy span, which a 365.25-day divisor would", () => {
    // 2008-08-09 is one day short of 18. A days/365.25 calculation returns 17.997 → 17 here
    // too, but returns 18 for 2008-08-10 in some years. Pin the exact boundary instead.
    expect(ageInYears(dob("2008-08-09"), NOW)).toBe(17);
    expect(ageInYears(dob("2008-08-08"), NOW)).toBe(18);
  });
});

describe("isMinor", () => {
  it("is false on the eighteenth birthday", () => {
    expect(isMinor(dob("2008-08-08"), NOW)).toBe(false);
  });

  it("is true one day before it", () => {
    expect(isMinor(dob("2008-08-09"), NOW)).toBe(true);
  });

  /**
   * The single most important assertion in this file. An account with no stated date of birth
   * must NOT read as an adult — that is exactly what the old `confirmedAdult` checkbox did:
   * it defaulted to true, nothing verified it, and the Terms claimed 18+ on that basis.
   * `null` forces every caller to decide, and every gate treats it as unverified.
   */
  it("returns null for an unknown date of birth, never false", () => {
    expect(isMinor(null, NOW)).toBeNull();
    expect(isMinor(undefined, NOW)).toBeNull();
  });
});

describe("minorDateOfBirthCutoff", () => {
  it("is the eighteenth birthday of someone who turns 18 today", () => {
    expect(minorDateOfBirthCutoff(NOW).toISOString().slice(0, 10)).toBe("2008-08-08");
  });
});

describe("isPlausibleDateOfBirth", () => {
  it("rejects the future", () => {
    expect(isPlausibleDateOfBirth(dob("2027-01-01"), NOW)).toBe(false);
  });

  it("rejects an implausible age", () => {
    expect(isPlausibleDateOfBirth(dob("1880-01-01"), NOW)).toBe(false);
  });

  it("rejects an unparseable date", () => {
    expect(isPlausibleDateOfBirth(new Date("not a date"), NOW)).toBe(false);
  });

  it("accepts an ordinary one", () => {
    expect(isPlausibleDateOfBirth(dob("2010-03-14"), NOW)).toBe(true);
  });
});
