import { describe, expect, it } from "vitest";

import {
  analyticsWindowInZone,
  bucketKeyInZone,
  bucketKeysInZone,
  bucketLabelInZone,
  isMonthlyRange,
} from "./buckets";

/**
 * INT-14. Both analytics dashboards bucketed in UTC, so for a teacher in Los Angeles every
 * evening lesson landed on the following day and the last afternoon of a month landed in the
 * next month — always shifting activity forward, never back.
 */
const LA = "America/Los_Angeles";
const TOKYO = "Asia/Tokyo";

// 1 August, 18:00 in Los Angeles. In UTC this is already 2 August.
const LA_EVENING_LESSON = new Date("2026-08-02T01:00:00.000Z");
// 31 August, 18:00 in Los Angeles. In UTC this is already September.
const LA_MONTH_EDGE = new Date("2026-09-01T01:00:00.000Z");

describe("bucketKeyInZone", () => {
  it("attributes an evening lesson to the teacher's day, not UTC's", () => {
    expect(bucketKeyInZone(LA_EVENING_LESSON, "30d", LA)).toBe("2026-08-01");
    // The old behaviour, kept as the regression marker.
    expect(bucketKeyInZone(LA_EVENING_LESSON, "30d", "UTC")).toBe("2026-08-02");
  });

  it("keeps a month-end evening in the month it happened", () => {
    expect(bucketKeyInZone(LA_MONTH_EDGE, "365d", LA)).toBe("2026-08");
    expect(bucketKeyInZone(LA_MONTH_EDGE, "365d", "UTC")).toBe("2026-09");
  });

  it("works for a zone ahead of UTC too", () => {
    // 08:00 on 2 Aug in Tokyo is still 1 Aug in UTC — the error runs the other way.
    const morning = new Date("2026-08-01T23:00:00.000Z");
    expect(bucketKeyInZone(morning, "30d", TOKYO)).toBe("2026-08-02");
    expect(bucketKeyInZone(morning, "30d", "UTC")).toBe("2026-08-01");
  });

  it("uses month keys for the long ranges and day keys for the short ones", () => {
    expect(bucketKeyInZone(LA_EVENING_LESSON, "all", LA)).toBe("2026-08");
    expect(bucketKeyInZone(LA_EVENING_LESSON, "90d", LA)).toBe("2026-08-01");
  });

  it("falls back to UTC rather than producing an invalid key", () => {
    expect(bucketKeyInZone(LA_EVENING_LESSON, "30d", "Not/AZone")).toBe("2026-08-02");
  });
});

describe("isMonthlyRange", () => {
  it("rolls up the long ranges by month", () => {
    expect(isMonthlyRange("365d")).toBe(true);
    expect(isMonthlyRange("all")).toBe(true);
    expect(isMonthlyRange("30d")).toBe(false);
    expect(isMonthlyRange("90d")).toBe(false);
  });
});

describe("bucketLabelInZone", () => {
  it("renders a day key as the day it names", () => {
    // Pinned to UTC internally, so a server in another zone cannot shift it back a day.
    expect(bucketLabelInZone("2026-08-01")).toContain("Aug");
    expect(bucketLabelInZone("2026-08-01")).toContain("1");
    expect(bucketLabelInZone("2026-08-01")).toContain("2026");
  });

  it("renders a month key as a month", () => {
    expect(bucketLabelInZone("2026-08")).toContain("Aug");
    expect(bucketLabelInZone("2026-08")).toContain("2026");
  });
});

describe("analyticsWindowInZone", () => {
  it("starts the window at the viewer's local midnight", () => {
    const { start, days } = analyticsWindowInZone("30d", LA, LA_EVENING_LESSON);
    expect(days).toBe(30);
    // 30 days inclusive ending 1 Aug local means the window opens on 3 July, 00:00 PDT,
    // which is 07:00 UTC — not 00:00 UTC.
    expect(start?.toISOString()).toBe("2026-07-03T07:00:00.000Z");
  });

  it("ends at the current instant, not the end of the local day", () => {
    const { end } = analyticsWindowInZone("30d", LA, LA_EVENING_LESSON);
    expect(end.toISOString()).toBe(LA_EVENING_LESSON.toISOString());
  });

  it("puts the previous period immediately before the current one", () => {
    const { start, previousEnd, previousStart } = analyticsWindowInZone(
      "30d",
      LA,
      LA_EVENING_LESSON,
    );
    expect(previousEnd!.getTime()).toBe(start!.getTime() - 1);
    expect(previousStart!.getTime()).toBeLessThan(previousEnd!.getTime());
  });

  it("has no bounded window for all-time", () => {
    const window = analyticsWindowInZone("all", LA, LA_EVENING_LESSON);
    expect(window.start).toBeNull();
    expect(window.days).toBeNull();
  });
});

describe("bucketKeysInZone", () => {
  it("emits one key per local day, covering the whole window", () => {
    const { start, end } = analyticsWindowInZone("30d", LA, LA_EVENING_LESSON);
    const keys = bucketKeysInZone("30d", start, end, LA);
    expect(keys).toHaveLength(30);
    expect(keys[0]).toBe("2026-07-03");
    expect(keys.at(-1)).toBe("2026-08-01");
  });

  it("emits month keys for a yearly range", () => {
    const { start, end } = analyticsWindowInZone("365d", LA, LA_EVENING_LESSON);
    const keys = bucketKeysInZone("365d", start, end, LA);
    expect(keys.at(-1)).toBe("2026-08");
    expect(keys.every((key) => /^\d{4}-\d{2}$/.test(key))).toBe(true);
  });

  it("emits the trailing twelve months for all-time", () => {
    const keys = bucketKeysInZone("all", null, LA_EVENING_LESSON, LA);
    expect(keys).toHaveLength(12);
    expect(keys.at(-1)).toBe("2026-08");
    expect(keys[0]).toBe("2025-09");
  });

  it("produces a bucket that every instant in the window can land in", () => {
    // The scaffold and the key function have to agree, or activity silently vanishes from
    // the chart instead of showing up in the wrong bar.
    const { start, end } = analyticsWindowInZone("30d", LA, LA_EVENING_LESSON);
    const keys = new Set(bucketKeysInZone("30d", start, end, LA));
    expect(keys.has(bucketKeyInZone(LA_EVENING_LESSON, "30d", LA))).toBe(true);
    expect(keys.has(bucketKeyInZone(start!, "30d", LA))).toBe(true);
  });
});
