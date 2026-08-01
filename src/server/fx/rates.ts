import { db } from "@/lib/db";
import { STATIC_USD_RATES } from "@/lib/fx";
import { logger } from "@/lib/observability/logger";
import { fetchReferenceRates } from "@/services/fx/provider";

export const FX_BASE_CURRENCY = "USD";

/**
 * How old the SOURCE observation date may get before we treat the table as stale.
 *
 * ECB publishes on TARGET business days only, so on a Monday morning the newest legitimate
 * observation is Friday's — three days. Four gives a day of headroom for a missed run
 * without crying wolf every weekend.
 */
export const FX_STALE_AFTER_DAYS = 4;

type RateTable = { rates: Record<string, number>; asOf: Date | null; source: string };

/**
 * Per-process cache. Rates change once a day, so re-reading them on every marketplace
 * render is pure overhead — but the TTL is short enough that a refresh is picked up
 * promptly without a deploy.
 */
const CACHE_TTL_MS = 5 * 60_000;
let cache: { value: RateTable; expiresAt: number } | null = null;

export function clearFxCache(): void {
  cache = null;
}

function staticFallback(): RateTable {
  return { rates: { ...STATIC_USD_RATES }, asOf: null, source: "static-fallback" };
}

/**
 * Current USD rate table.
 *
 * Falls back to the compiled-in reference table when the database has no rates yet — on a
 * fresh deploy, before the first cron run, ranking must still work.
 */
export async function getUsdRateTable(): Promise<RateTable> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  try {
    const rows = await db.fxRate.findMany({
      where: { baseCurrency: FX_BASE_CURRENCY },
      select: { quoteCurrency: true, rate: true, asOf: true, source: true },
    });

    if (rows.length === 0) {
      const value = staticFallback();
      cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
      return value;
    }

    const rates: Record<string, number> = {};
    let newest: Date | null = null;
    for (const row of rows) {
      rates[row.quoteCurrency] = Number(row.rate);
      if (!newest || row.asOf > newest) newest = row.asOf;
    }

    const value = { rates, asOf: newest, source: rows[0].source };
    cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch (error) {
    // A database blip must not break the marketplace; ranking degrades to the static table.
    logger.warn("fx_rate_table_read_failed", { error: String(error) });
    return staticFallback();
  }
}

export function isStale(asOf: Date | null, now = new Date()): boolean {
  if (!asOf) return true;
  const ageDays = (now.getTime() - asOf.getTime()) / 86_400_000;
  return ageDays > FX_STALE_AFTER_DAYS;
}

/**
 * Refresh the stored rates from a reference feed.
 *
 * On total source failure the existing table is deliberately left alone — yesterday's rates
 * beat none — and the staleness alarm is what surfaces the problem.
 */
export async function refreshFxRates(now = new Date()): Promise<{
  updated: number;
  asOf: string | null;
  stale: boolean;
  source: string | null;
}> {
  const quote = await fetchReferenceRates(FX_BASE_CURRENCY);

  if (!quote) {
    const existing = await getUsdRateTable();
    const stale = isStale(existing.asOf, now);
    if (stale) {
      logger.error("fx_rates_stale_and_refresh_failed", {
        asOf: existing.asOf?.toISOString() ?? null,
        staleAfterDays: FX_STALE_AFTER_DAYS,
      });
    }
    return { updated: 0, asOf: existing.asOf?.toISOString().slice(0, 10) ?? null, stale, source: null };
  }

  const asOf = new Date(`${quote.asOf}T00:00:00.000Z`);
  const entries = Object.entries(quote.rates);

  await db.$transaction(
    entries.map(([quoteCurrency, rate]) =>
      db.fxRate.upsert({
        where: {
          baseCurrency_quoteCurrency: {
            baseCurrency: FX_BASE_CURRENCY,
            quoteCurrency,
          },
        },
        create: {
          baseCurrency: FX_BASE_CURRENCY,
          quoteCurrency,
          rate,
          asOf,
          source: quote.source,
        },
        update: { rate, asOf, source: quote.source, fetchedAt: now },
      }),
    ),
  );

  clearFxCache();

  // Alarm on the OBSERVATION date, not on whether the fetch succeeded. A feed happily
  // serving last week's numbers is the failure mode that would otherwise go unnoticed.
  const stale = isStale(asOf, now);
  if (stale) {
    logger.error("fx_rates_stale", {
      asOf: quote.asOf,
      source: quote.source,
      staleAfterDays: FX_STALE_AFTER_DAYS,
    });
  }

  return { updated: entries.length, asOf: quote.asOf, stale, source: quote.source };
}
