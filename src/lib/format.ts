import { minorUnitFactor } from "@/lib/currencies";

/**
 * Date, time and money formatting.
 *
 * Two rules hold everywhere in this module, both learned the hard way:
 *
 * 1. `timeZone` is REQUIRED on anything that renders an instant (INT-03). It used to be
 *    optional, so a forgotten argument silently rendered the SERVER's zone — the student
 *    dashboard showed one time for a lesson while the booking page showed another, for the
 *    same booking. Making it required turns every omission into a compile error.
 *
 * 2. Every rendered time carries a zone label. Without one a user cannot tell whether
 *    "09:00" means their morning or someone else's, which is what made the other timezone
 *    defects silent rather than self-correcting.
 *
 * INT-07: `en-ZA` was hardcoded in ~10 files, so users worldwide got South African
 * conventions — 24-hour clocks, day-first dates, and `1 234 567` number grouping. All Intl
 * construction now happens here against one documented locale.
 */

/**
 * Canonical display locale.
 *
 * The platform is English-only for now. Dates are always formatted with an abbreviated
 * MONTH NAME rather than a numeric month, so output is unambiguous to a reader from any
 * country regardless of whether they expect day-first or month-first ordering. Per-user
 * locale negotiation is a later enhancement; this constant is the single place to change.
 */
export const DISPLAY_LOCALE = "en-GB";

/**
 * Render an integer minor-unit amount.
 *
 * INT-09: this divided by 100 and capped the display at 2 decimals for every currency, so
 * ¥5000 rendered as "¥50" — the same hundredfold error the provider-facing serialiser had,
 * showing on the teacher card and the checkout page. Both the divisor and the decimal cap
 * now come from the currency's own minor-unit exponent.
 *
 * A whole amount still drops its fraction ($25, not $25.00). When there IS a fraction the
 * digit count is left to Intl rather than pinned at 2, so a three-decimal currency renders
 * all three.
 */
export function formatCurrency(minorUnits: number, currency = "USD"): string {
  const factor = minorUnitFactor(currency);
  const isWholeAmount = minorUnits % factor === 0;

  return new Intl.NumberFormat(DISPLAY_LOCALE, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    ...(isWholeAmount ? { maximumFractionDigits: 0 } : {}),
  }).format(minorUnits / factor);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(DISPLAY_LOCALE).format(value);
}

/** A calendar date with no time component — safe to render without a zone. */
export function formatDate(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
}

/**
 * Render an instant in a specific IANA timezone, always with a zone label.
 *
 * `timeZone` is intentionally required — see the module note.
 */
export function formatDateTime(
  date: Date | string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone,
    ...options,
  }).format(value);
}

/** Time of day only, with a zone label — for slot lists where the date is already shown. */
export function formatTime(date: Date | string, timeZone: string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone,
  }).format(value);
}

/** Weekday and date in a specific zone — for grouping slots by the viewer's own day. */
export function formatDayLabel(date: Date | string, timeZone: string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  }).format(value);
}

/** The calendar date (YYYY-MM-DD) an instant falls on in a given zone. */
export function dateKeyInZone(date: Date | string, timeZone: string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(value);
  return parts;
}

export function formatStatus(status: string): string {
  return status.replaceAll("_", " ");
}
