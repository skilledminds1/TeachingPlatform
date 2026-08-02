import { describe, expect, it } from "vitest";

import {
  dateOnlyUtc,
  localDateTimeToUtc,
  resolveLocalDateTime,
  todayInZone,
  zoneLabel,
} from "./timezone";

/**
 * INT-14. Every case here is a teacher whose calendar day is not Greenwich's.
 *
 * 17:00 in Los Angeles is already tomorrow in UTC, which is what made the "today" guards
 * reject a teacher's own evening — the emergency the blocked-time feature exists for.
 */
const LA = "America/Los_Angeles";
const LA_EVENING = new Date("2026-08-02T00:00:00.000Z"); // 1 Aug, 17:00 PDT

describe("todayInZone", () => {
  it("returns the viewer's calendar date, not UTC's", () => {
    expect(todayInZone(LA, LA_EVENING)).toBe("2026-08-01");
    expect(todayInZone("UTC", LA_EVENING)).toBe("2026-08-02");
  });

  it("handles a zone that is ahead of UTC as well as behind", () => {
    // 23:00 UTC on 1 Aug is already 08:00 on 2 Aug in Tokyo.
    const lateUtc = new Date("2026-08-01T23:00:00.000Z");
    expect(todayInZone("Asia/Tokyo", lateUtc)).toBe("2026-08-02");
    expect(todayInZone("UTC", lateUtc)).toBe("2026-08-01");
  });

  it("falls back to UTC rather than throwing on an unusable zone", () => {
    // A bad zone must not make every date guard reject.
    expect(todayInZone("Not/AZone", LA_EVENING)).toBe("2026-08-02");
  });
});

describe("the today guard an LA teacher hits", () => {
  // The guard is a string comparison against the teacher's local date. This is the exact
  // expression from addAvailabilityException.
  function isPast(specificDate: string, zone: string, now: Date): boolean {
    return specificDate < todayInZone(zone, now);
  }

  it("lets a Los Angeles teacher block their own remaining evening", () => {
    expect(isPast("2026-08-01", LA, LA_EVENING)).toBe(false);
  });

  it("still rejects a date that is genuinely past for them", () => {
    expect(isPast("2026-07-31", LA, LA_EVENING)).toBe(true);
  });

  it("would have rejected the evening under the old UTC comparison", () => {
    // Kept as the regression marker: this is what the guard used to do.
    expect(isPast("2026-08-01", "UTC", LA_EVENING)).toBe(true);
  });
});

describe("dateOnlyUtc", () => {
  it("anchors a calendar date at UTC midnight, matching how specificDate is stored", () => {
    expect(dateOnlyUtc("2026-08-01").toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });
});

/**
 * Daylight saving deletes one local hour each spring and repeats one each autumn. Luxon
 * resolves both silently, so a teacher blocking 01:30 got a different hour with no notice.
 */
describe("resolveLocalDateTime", () => {
  const LONDON = "Europe/London";

  it("reports a local time that does not exist", () => {
    // London clocks jump 01:00 -> 02:00 on 29 March 2026, so 01:30 never happens.
    const { warning } = resolveLocalDateTime({
      date: "2026-03-29",
      time: "01:30",
      timeZone: LONDON,
    });
    expect(warning?.kind).toBe("nonexistent");
    expect(warning?.message).toContain("does not exist");
    expect(warning?.message).toContain("02:30");
  });

  it("reports a local time that happens twice", () => {
    // London clocks fall back 02:00 -> 01:00 on 25 October 2026, so 01:30 happens twice.
    const { warning } = resolveLocalDateTime({
      date: "2026-10-25",
      time: "01:30",
      timeZone: LONDON,
    });
    expect(warning?.kind).toBe("ambiguous");
    expect(warning?.message).toContain("happens twice");
  });

  it("says nothing about an ordinary time", () => {
    for (const date of ["2026-03-28", "2026-06-15", "2026-10-26"]) {
      const { warning } = resolveLocalDateTime({ date, time: "09:00", timeZone: LONDON });
      expect(warning, `${date} should be unremarkable`).toBeNull();
    }
  });

  it("says nothing about a transition day at an unaffected hour", () => {
    const { warning } = resolveLocalDateTime({
      date: "2026-03-29",
      time: "09:00",
      timeZone: LONDON,
    });
    expect(warning).toBeNull();
  });

  it("still returns a usable instant in every case", () => {
    // A warning is not an error — something has to be stored either way.
    for (const time of ["01:30", "09:00"]) {
      for (const date of ["2026-03-29", "2026-10-25"]) {
        const { utc } = resolveLocalDateTime({ date, time, timeZone: LONDON });
        expect(Number.isNaN(utc.getTime())).toBe(false);
      }
    }
  });

  it("rejects a genuinely invalid zone or time", () => {
    expect(() =>
      resolveLocalDateTime({ date: "2026-03-29", time: "25:99", timeZone: LONDON }),
    ).toThrow();
    expect(() =>
      resolveLocalDateTime({ date: "2026-03-29", time: "09:00", timeZone: "Not/AZone" }),
    ).toThrow();
  });

  it("keeps localDateTimeToUtc returning the same instant it always did", () => {
    const input = { date: "2026-06-15", time: "09:00", timeZone: LONDON };
    expect(localDateTimeToUtc(input).toISOString()).toBe(
      resolveLocalDateTime(input).utc.toISOString(),
    );
    // 09:00 BST is 08:00 UTC.
    expect(localDateTimeToUtc(input).toISOString()).toBe("2026-06-15T08:00:00.000Z");
  });
});

describe("zoneLabel", () => {
  it("names the zone with the abbreviation and offset in force", () => {
    const label = zoneLabel(LA, LA_EVENING);
    expect(label).toContain("America/Los Angeles");
    expect(label).toContain("UTC-07:00");
  });

  it("degrades to the raw zone id rather than throwing", () => {
    expect(zoneLabel("Not/AZone", LA_EVENING)).toBe("Not/AZone");
  });
});
