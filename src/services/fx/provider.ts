import { logger } from "@/lib/observability/logger";

/**
 * Reference exchange-rate feeds (INT-11).
 *
 * Two independent sources, tried in order. Neither needs an API key, which matters for a
 * solo operator: a key is one more secret to rotate and one more thing to expire silently.
 *
 * Primary is the ECB via Frankfurter — an authoritative central-bank reference that
 * publishes the observation date, so staleness is detectable rather than inferred.
 * ECB publishes on TARGET business days only, so a weekend response legitimately carries
 * Friday's date; the staleness threshold accounts for that.
 */

export type FxQuote = {
  base: string;
  /** Units of the quote currency per 1 base unit. */
  rates: Record<string, number>;
  /** Date the SOURCE published these rates (YYYY-MM-DD), not when we fetched them. */
  asOf: string;
  source: string;
};

const FETCH_TIMEOUT_MS = 10_000;

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function sanitiseRates(input: unknown, base: string): Record<string, number> {
  const rates: Record<string, number> = {};
  if (!input || typeof input !== "object") return rates;

  for (const [code, value] of Object.entries(input as Record<string, unknown>)) {
    const rate = Number(value);
    // Reject anything non-finite or non-positive rather than storing a number that would
    // later divide into a nonsense price.
    if (!Number.isFinite(rate) || rate <= 0) continue;
    if (!/^[A-Z]{3}$/.test(code)) continue;
    rates[code] = rate;
  }
  // A feed always quotes the base as 1; make that explicit so callers never special-case it.
  rates[base] = 1;
  return rates;
}

/** ECB reference rates. Publishes an explicit observation date. */
async function fetchFrankfurter(base: string): Promise<FxQuote | null> {
  try {
    const payload = (await fetchJson(
      `https://api.frankfurter.app/latest?base=${encodeURIComponent(base)}`,
    )) as { base?: string; date?: string; rates?: unknown };

    if (!payload?.date || !payload.rates) return null;
    const rates = sanitiseRates(payload.rates, base);
    if (Object.keys(rates).length < 2) return null;

    return { base, rates, asOf: payload.date, source: "frankfurter.app (ECB)" };
  } catch (error) {
    logger.warn("fx_provider_frankfurter_failed", { error: String(error) });
    return null;
  }
}

/** Fallback. Reports its own update timestamp, which we reduce to a date. */
async function fetchExchangeRateApi(base: string): Promise<FxQuote | null> {
  try {
    const payload = (await fetchJson(
      `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`,
    )) as { result?: string; rates?: unknown; time_last_update_utc?: string };

    if (payload?.result !== "success" || !payload.rates) return null;
    const rates = sanitiseRates(payload.rates, base);
    if (Object.keys(rates).length < 2) return null;

    const updated = payload.time_last_update_utc
      ? new Date(payload.time_last_update_utc)
      : new Date();
    const asOf = Number.isNaN(updated.getTime())
      ? new Date().toISOString().slice(0, 10)
      : updated.toISOString().slice(0, 10);

    return { base, rates, asOf, source: "open.er-api.com" };
  } catch (error) {
    logger.warn("fx_provider_er_api_failed", { error: String(error) });
    return null;
  }
}

/**
 * Fetch current rates, trying each source in turn.
 *
 * Returns null when every source fails — the caller keeps the existing table rather than
 * wiping it, because yesterday's rates are far better than none.
 */
export async function fetchReferenceRates(base = "USD"): Promise<FxQuote | null> {
  for (const fetchFrom of [fetchFrankfurter, fetchExchangeRateApi]) {
    const quote = await fetchFrom(base);
    if (quote) return quote;
  }
  logger.error("fx_provider_all_sources_failed", { base });
  return null;
}
