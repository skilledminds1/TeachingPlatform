import { getUsdRateTable, isStale } from "@/server/fx/rates";

/**
 * Currency conversion against the live rate table (INT-11).
 *
 * Display and ranking ONLY. Nothing here is ever charged — students always pay the
 * teacher's listed amount in the teacher's own currency, and every converted figure the UI
 * shows is labelled as approximate.
 */

export type ConversionContext = {
  /** Units of the currency per 1 USD. */
  rates: Record<string, number>;
  asOf: Date | null;
  stale: boolean;
};

export async function getConversionContext(now = new Date()): Promise<ConversionContext> {
  const table = await getUsdRateTable();
  return { rates: table.rates, asOf: table.asOf, stale: isStale(table.asOf, now) };
}

/** Convert a minor-unit amount between two currencies, or null if either rate is unknown. */
export function convertMinorUnits(
  amount: number,
  from: string,
  to: string,
  context: ConversionContext,
): number | null {
  if (!Number.isFinite(amount)) return null;
  const fromCode = from.toUpperCase();
  const toCode = to.toUpperCase();
  if (fromCode === toCode) return Math.round(amount);

  const fromRate = context.rates[fromCode];
  const toRate = context.rates[toCode];
  if (!fromRate || !toRate) return null;

  // Both rates are quoted per 1 USD, so route through USD.
  return Math.round((amount / fromRate) * toRate);
}

/** Convert to USD minor units, for ranking. */
export function toUsdMinorUnits(
  amount: number,
  from: string,
  context: ConversionContext,
): number | null {
  return convertMinorUnits(amount, from, "USD", context);
}

/**
 * An indicative price for a viewer whose currency differs from the teacher's.
 *
 * Returns null when no conversion should be shown — same currency, unknown rate, or a rate
 * table too old to stand behind. Showing nothing is better than showing a number a student
 * might budget against and find wrong at checkout.
 */
export function indicativeAmount(input: {
  amountMinorUnits: number;
  from: string;
  viewerCurrency: string | null;
  context: ConversionContext;
}): { amount: number; currency: string } | null {
  const { amountMinorUnits, from, viewerCurrency, context } = input;
  if (!viewerCurrency) return null;
  if (viewerCurrency.toUpperCase() === from.toUpperCase()) return null;
  if (context.stale) return null;

  const converted = convertMinorUnits(amountMinorUnits, from, viewerCurrency, context);
  if (converted === null) return null;

  return { amount: converted, currency: viewerCurrency.toUpperCase() };
}
