import { DEFAULT_LESSON_CURRENCY, isLessonCurrency } from "@/lib/currencies";

/**
 * Currency conversion for DISPLAY AND RANKING ONLY (INT-12).
 *
 * The marketplace price filter and price sort compared `hourlyRateCents` directly while each
 * teacher stores their own settlement currency, so the numbers being compared were in
 * different units: a £45 teacher (about $57) appeared inside "Up to $50/hour" while a
 * cheaper teacher priced in another currency could be excluded, and "price: low to high"
 * ordered by a meaningless mixture.
 *
 * IMPORTANT — what these rates may and may not be used for.
 *
 * They MUST NOT be used to charge, invoice, refund, or settle anything. Students always pay
 * the teacher's own listed amount in the teacher's own currency; nothing here ever touches
 * money. This is the crucial difference from PAYFAST_USD_ZAR_RATE, which was a hand-edited
 * constant used to compute a real charge — that is a billing incident waiting to happen, and
 * this is not, because the worst case here is a teacher sitting one bucket off in a filter.
 *
 * The rates are a static reference table. That is deliberately good enough for ranking: a
 * few percent of drift moves nobody more than a bucket, and the ordering within a bucket
 * barely changes. INT-11 replaces this with a daily pull plus a staleness alarm, at which
 * point only `usdRate` needs to change.
 */

/**
 * Compiled-in reference rates, used ONLY when the database has no rates yet — a fresh
 * deploy before the first cron run, or a database read failure. INT-11 makes the live table
 * authoritative; these exist so ranking never breaks outright.
 *
 * They drift: checked against the ECB feed the day after they were written, GBP was already
 * 6% out. Treat them as a floor on correctness, not a source of truth.
 */
export const STATIC_USD_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  AUD: 1.52,
  CAD: 1.36,
};

/** When these reference rates were last reviewed, so staleness is visible rather than implied. */
export const FX_RATES_REVIEWED_ON = "2026-07-31";

export function usdRate(currency: string): number | null {
  return STATIC_USD_RATES[currency.toUpperCase()] ?? null;
}

/**
 * Convert a minor-unit amount to USD cents for comparison.
 *
 * Returns null for a currency with no known rate rather than guessing — a wrong number here
 * would silently mis-rank a teacher, which is harder to notice than an absent one.
 */
export function toUsdCents(amountCents: number, currency: string): number | null {
  if (!Number.isFinite(amountCents)) return null;
  const rate = usdRate(currency);
  if (!rate) return null;
  return Math.round(amountCents / rate);
}

/**
 * Convert for storage in the normalised column, falling back to treating the amount as
 * already-USD when the currency is unknown. Used on write, where refusing to store anything
 * would hide the teacher from price filtering entirely.
 */
export function toUsdCentsForRanking(amountCents: number, currency: string): number {
  return (
    toUsdCents(amountCents, currency) ??
    toUsdCents(amountCents, DEFAULT_LESSON_CURRENCY) ??
    amountCents
  );
}

/** Every currency the ranking conversion knows about, for tests and diagnostics. */
export function convertibleCurrencies(): string[] {
  return Object.keys(STATIC_USD_RATES);
}

/** True when a teacher's stored currency can be ranked without a fallback. */
export function isConvertibleCurrency(currency: string): boolean {
  return isLessonCurrency(currency) && usdRate(currency) !== null;
}
