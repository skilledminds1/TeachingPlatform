import { describe, expect, it } from "vitest";

import { dateKeyInZone, formatDateTime, formatDayLabel, formatTime } from "./format";
import { isValidIanaTimeZone, supportedTimeZones } from "./timezone-validation";

// 09:00 UTC on a Monday. Deliberately chosen so the same instant falls on a DIFFERENT
// calendar day depending on the viewer's zone — the condition that produced wrong-day
// bookings in the slot picker.
const INSTANT = new Date("2026-08-10T09:00:00.000Z");
// 23:30 UTC Sunday is already Monday in Tokyo and still Sunday in New York.
const LATE = new Date("2026-08-09T23:30:00.000Z");

describe("formatDateTime", () => {
  it("renders the same instant differently per zone", () => {
    const tokyo = formatDateTime(INSTANT, "Asia/Tokyo");
    const newYork = formatDateTime(INSTANT, "America/New_York");
    expect(tokyo).not.toBe(newYork);
  });

  // INT-03: without a zone label a user cannot tell whose morning "09:00" refers to, which
  // is what made every other timezone defect silent instead of self-correcting.
  it("always includes a timezone label", () => {
    expect(formatDateTime(INSTANT, "Asia/Tokyo")).toMatch(/GMT|UTC|[A-Z]{2,5}/);
    expect(formatTime(INSTANT, "Europe/London")).toMatch(/GMT|UTC|[A-Z]{2,5}/);
  });

  it("uses an abbreviated month name, so the date is unambiguous in any locale", () => {
    // "10 Aug 2026", never "10/08/2026" or "08/10/2026".
    expect(formatDateTime(INSTANT, "UTC")).toMatch(/Aug/);
    expect(formatDateTime(INSTANT, "UTC")).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it("accepts an ISO string as well as a Date", () => {
    expect(formatDateTime(INSTANT.toISOString(), "UTC")).toBe(formatDateTime(INSTANT, "UTC"));
  });
});

describe("dateKeyInZone", () => {
  // This is the function the slot picker groups by. If it returned the server's day rather
  // than the viewer's, the wrong-day bug would be back.
  it("returns the viewer's calendar day, not UTC's", () => {
    expect(dateKeyInZone(LATE, "Asia/Tokyo")).toBe("2026-08-10");
    expect(dateKeyInZone(LATE, "America/New_York")).toBe("2026-08-09");
    expect(dateKeyInZone(LATE, "UTC")).toBe("2026-08-09");
  });

  it("produces sortable YYYY-MM-DD keys", () => {
    const keys = [
      dateKeyInZone(new Date("2026-08-10T00:00:00Z"), "UTC"),
      dateKeyInZone(new Date("2026-08-09T00:00:00Z"), "UTC"),
      dateKeyInZone(new Date("2026-12-01T00:00:00Z"), "UTC"),
    ];
    expect([...keys].sort()).toEqual(["2026-08-09", "2026-08-10", "2026-12-01"]);
  });
});

describe("formatDayLabel", () => {
  it("labels the day in the viewer's zone", () => {
    expect(formatDayLabel(LATE, "Asia/Tokyo")).toContain("Mon");
    expect(formatDayLabel(LATE, "America/New_York")).toContain("Sun");
  });

  it("agrees with dateKeyInZone for the same instant and zone", () => {
    for (const zone of ["Asia/Tokyo", "America/New_York", "Europe/London", "UTC"]) {
      const key = dateKeyInZone(LATE, zone);
      const label = formatDayLabel(LATE, zone);
      const day = Number(key.slice(-2));
      expect(label).toContain(String(day));
    }
  });
});

describe("isValidIanaTimeZone", () => {
  it("accepts real zones across every region", () => {
    for (const zone of [
      "Africa/Johannesburg",
      "Asia/Manila",
      "America/Sao_Paulo",
      "Europe/Warsaw",
      "Pacific/Auckland",
      "UTC",
    ]) {
      expect(isValidIanaTimeZone(zone), `${zone} should be valid`).toBe(true);
    }
  });

  it("rejects nonsense and non-strings", () => {
    expect(isValidIanaTimeZone("Not/AZone")).toBe(false);
    expect(isValidIanaTimeZone("")).toBe(false);
    expect(isValidIanaTimeZone(null)).toBe(false);
    expect(isValidIanaTimeZone(42)).toBe(false);
  });

  // INT-02: the old hand-curated list was 47 Africa-first entries, so a teacher in Manila
  // could not store their own zone.
  it("covers far more zones than the hand-curated list it replaced", () => {
    const zones = supportedTimeZones();
    expect(zones.length).toBeGreaterThan(300);
    expect(zones).toContain("Asia/Manila");
  });
});
