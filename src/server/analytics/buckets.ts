import { DateTime } from "luxon";

import type { AnalyticsRange } from "@/features/teacher-dashboard/lib/analytics-range";
import { DISPLAY_LOCALE } from "@/lib/format";

/**
 * Calendar bucketing for the analytics dashboards (INT-14).
 *
 * Both dashboards used to carry their own copy of these helpers, and both bucketed in UTC:
 * `getUTCFullYear`/`getUTCMonth` for months and `toISOString().slice(0, 10)` for days. For a
 * teacher in Los Angeles that put every lesson taught after 17:00 on the following day, and
 * pushed the last afternoon of a month into the next one — so "lessons this month" was wrong
 * for anyone far enough from Greenwich, in the direction that flatters the next period.
 *
 * A day is whatever the VIEWER's calendar says it is, so every function here takes their
 * zone. The helpers live in one module because the defect existed twice: fixing a copy is
 * how it survives.
 */

/** Ranges that roll up by month rather than by day. */
export function isMonthlyRange(range: AnalyticsRange): boolean {
  return range === "365d" || range === "all";
}

function inZone(date: Date, timeZone: string): DateTime {
  const value = DateTime.fromJSDate(date, { zone: timeZone });
  // An unusable zone must not collapse every bucket into "Invalid DateTime".
  return value.isValid ? value : DateTime.fromJSDate(date, { zone: "utc" });
}

/** The bucket an instant belongs to, in the viewer's own calendar. */
export function bucketKeyInZone(
  date: Date,
  range: AnalyticsRange,
  timeZone: string,
): string {
  const local = inZone(date, timeZone);
  return isMonthlyRange(range) ? local.toFormat("yyyy-MM") : (local.toISODate() ?? "");
}

/**
 * Human label for a bucket key.
 *
 * The key is already a local calendar date, so it is rendered as written — pinned to UTC so
 * the server's own zone cannot shift "1 Aug" back to "31 Jul" on the way to the screen,
 * which is the same class of bug one layer down.
 */
export function bucketLabelInZone(key: string): string {
  const isMonthKey = key.length === 7;
  if (isMonthKey) {
    const [year, month] = key.split("-").map(Number);
    // INT-07: one documented display locale, not the en-ZA that used to be hardcoded here.
    return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(year, month - 1, 1)));
  }
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${key}T00:00:00.000Z`));
}

/**
 * The reporting window for a range, with boundaries on the viewer's local midnight.
 *
 * `end` stays the current instant: the period runs up to now, not to the end of today.
 */
export function analyticsWindowInZone(
  range: AnalyticsRange,
  timeZone: string,
  now = new Date(),
): {
  start: Date | null;
  end: Date;
  previousStart: Date | null;
  previousEnd: Date | null;
  days: number | null;
} {
  if (range === "all") {
    return { start: null, end: now, previousStart: null, previousEnd: null, days: null };
  }

  const days = range === "30d" ? 30 : range === "90d" ? 90 : 365;
  const localToday = inZone(now, timeZone).startOf("day");
  const start = localToday.minus({ days: days - 1 });
  const previousEnd = start.minus({ milliseconds: 1 });
  const previousStart = previousEnd.startOf("day").minus({ days: days - 1 });

  return {
    start: start.toJSDate(),
    end: now,
    previousStart: previousStart.toJSDate(),
    previousEnd: previousEnd.toJSDate(),
    days,
  };
}

/**
 * Every bucket key in the window, oldest first, so a period with no activity still charts
 * as a flat line rather than collapsing to nothing.
 */
export function bucketKeysInZone(
  range: AnalyticsRange,
  start: Date | null,
  end: Date,
  timeZone: string,
): string[] {
  const keys: string[] = [];
  const last = inZone(end, timeZone);

  if (!start) {
    // All-time: the trailing twelve months of the viewer's own calendar.
    let cursor = last.startOf("month").minus({ months: 11 });
    while (cursor <= last) {
      keys.push(cursor.toFormat("yyyy-MM"));
      cursor = cursor.plus({ months: 1 });
    }
    return keys;
  }

  const first = inZone(start, timeZone);
  if (isMonthlyRange(range)) {
    let cursor = first.startOf("month");
    while (cursor <= last) {
      keys.push(cursor.toFormat("yyyy-MM"));
      cursor = cursor.plus({ months: 1 });
    }
    return keys;
  }

  let cursor = first.startOf("day");
  const lastDay = last.startOf("day");
  while (cursor <= lastDay) {
    keys.push(cursor.toISODate() ?? "");
    cursor = cursor.plus({ days: 1 });
  }
  return keys;
}
