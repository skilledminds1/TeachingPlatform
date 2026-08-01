/**
 * Infer the currency a viewer thinks in, for indicative price display only (INT-11).
 *
 * A student in Japan looking at a UK teacher previously saw "£25/hr" and nothing else — no
 * sense of what that costs them. This maps their browser locale's region to a currency so
 * the marketplace can show an approximate second figure.
 *
 * Nothing is ever charged in this currency. The teacher's own price stays the authoritative
 * figure and every converted number is labelled approximate.
 */

/**
 * Region to currency. Deliberately partial: it covers the regions a student is most likely
 * to browse from, and an unmapped region simply gets no conversion rather than a guess.
 * The rate table itself carries far more currencies, so extending this is a one-line change.
 */
const REGION_CURRENCY: Record<string, string> = {
  US: "USD", PR: "USD", EC: "USD",
  GB: "GBP",
  CA: "CAD",
  AU: "AUD", NZ: "NZD",
  JP: "JPY", CN: "CNY", HK: "HKD", TW: "TWD", KR: "KRW", SG: "SGD",
  IN: "INR", PK: "PKR", BD: "BDT", LK: "LKR",
  ID: "IDR", MY: "MYR", TH: "THB", VN: "VND", PH: "PHP",
  BR: "BRL", MX: "MXN", AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN",
  ZA: "ZAR", NG: "NGN", KE: "KES", GH: "GHS", EG: "EGP", MA: "MAD",
  CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", IS: "ISK",
  PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", BG: "BGN",
  TR: "TRY", UA: "UAH", RU: "RUB", IL: "ILS",
  AE: "AED", SA: "SAR", QA: "QAR", KW: "KWD",
  // Eurozone.
  AT: "EUR", BE: "EUR", CY: "EUR", DE: "EUR", EE: "EUR", ES: "EUR", FI: "EUR",
  FR: "EUR", GR: "EUR", HR: "EUR", IE: "EUR", IT: "EUR", LT: "EUR", LU: "EUR",
  LV: "EUR", MT: "EUR", NL: "EUR", PT: "EUR", SI: "EUR", SK: "EUR",
};

/** Currency for an explicit region code, or null when unmapped. */
export function currencyForRegion(region: string | null | undefined): string | null {
  if (!region) return null;
  return REGION_CURRENCY[region.toUpperCase()] ?? null;
}

/**
 * Best guess at the viewer's currency from a BCP-47 locale such as "en-GB" or "ja-JP".
 *
 * Language alone is never enough — "en" could be a dozen currencies — so a locale with no
 * region returns null rather than defaulting to dollars for every English speaker.
 */
export function currencyForLocale(locale: string | null | undefined): string | null {
  if (!locale) return null;
  try {
    const region = new Intl.Locale(locale).region;
    return currencyForRegion(region);
  } catch {
    // Fall back to parsing the tag directly for runtimes without Intl.Locale.
    const parts = String(locale).split(/[-_]/);
    const region = parts.find((part) => /^[A-Za-z]{2}$/.test(part) && part !== parts[0]);
    return currencyForRegion(region);
  }
}
