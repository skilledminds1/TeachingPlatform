import {
  DEFAULT_LESSON_CURRENCY,
  isLessonCurrency,
  minorUnitFactor,
} from "@/lib/currencies";

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
 * 6% out. Treat them as a floor on correctness, not a source of truth. The values below were
 * re-taken from the ECB feed on FX_RATES_REVIEWED_ON.
 *
 * INT-09: this table held only the five currencies the old settlement list offered. Every
 * currency added to LESSON_CURRENCIES must appear here too, or `toUsdCentsForRanking` falls
 * through to treating the teacher's price as though it were already USD — which puts a
 * ¥8,000 lesson in the "under $100" bucket as $8,000 and buries the teacher.
 * `src/lib/fx.test.ts` asserts the two lists agree so this cannot drift silently.
 */
export const STATIC_USD_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.8707,
  GBP: 0.74508,
  AUD: 1.4249,
  CAD: 1.4041,
  CHF: 0.8101,
  CZK: 21.081,
  DKK: 6.5087,
  HKD: 7.8432,
  ILS: 3.0574,
  JPY: 160.24,
  MXN: 17.3715,
  NOK: 9.5272,
  NZD: 1.7056,
  PHP: 61.269,
  PLN: 3.7558,
  SEK: 9.5651,
  SGD: 1.2849,
  THB: 33.465,
};

/** When these reference rates were last reviewed, so staleness is visible rather than implied. */
export const FX_RATES_REVIEWED_ON = "2026-08-01";

export function usdRate(currency: string): number | null {
  return STATIC_USD_RATES[currency.toUpperCase()] ?? null;
}

/**
 * Convert a minor-unit amount to USD cents for comparison.
 *
 * Returns null for a currency with no known rate rather than guessing — a wrong number here
 * would silently mis-rank a teacher, which is harder to notice than an absent one.
 *
 * INT-09: this divided minor units by the rate directly, which quietly assumed every
 * currency shares USD's two decimal digits. A ¥8,000 lesson is 8000 minor units, so the old
 * maths produced 8000/160.24 = 50 USD cents and ranked a ¥8,000/hour teacher at $0.50/hour —
 * bottom of every "price: low to high" sort on the marketplace. Both exponents now enter the
 * conversion explicitly.
 */
export function toUsdCents(amountCents: number, currency: string): number | null {
  if (!Number.isFinite(amountCents)) return null;
  const rate = usdRate(currency);
  if (!rate) return null;

  const majorUnits = amountCents / minorUnitFactor(currency);
  return Math.round((majorUnits / rate) * minorUnitFactor(DEFAULT_LESSON_CURRENCY));
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
