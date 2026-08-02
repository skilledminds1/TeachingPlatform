/**
 * ISO 3166-1 alpha-2 countries (INT-13).
 *
 * Only the CODES are tabulated; the display names come from the runtime's own ICU data.
 * A hand-written name list is a second thing to keep current — countries rename themselves
 * (Türkiye, Eswatini, Czechia) and ICU tracks that where we would not. Same reasoning as the
 * minor-unit exponents in src/lib/currencies.ts: derive what can be derived.
 *
 * Country is a prerequisite, not a nicety: payout eligibility (PAY-14), tax evidence
 * (PAY-06), the minors decision (PRD-04) and the restricted-jurisdiction check all need it.
 */

/** Every assigned ISO 3166-1 alpha-2 code. */
export const COUNTRY_CODES = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX",
  "AZ", "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ",
  "BR", "BS", "BT", "BV", "BW", "BY", "BZ", "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK",
  "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM",
  "DO", "DZ", "EC", "EE", "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR",
  "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS",
  "GT", "GU", "GW", "GY", "HK", "HM", "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN",
  "IO", "IQ", "IR", "IS", "IT", "JE", "JM", "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN",
  "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV",
  "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ",
  "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA", "NC", "NE", "NF", "NG", "NI",
  "NL", "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM",
  "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW", "SA", "SB", "SC",
  "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV",
  "SX", "SY", "SZ", "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR",
  "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI",
  "VN", "VU", "WF", "WS", "YE", "YT", "ZA", "ZM", "ZW",
] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];

const countrySet = new Set<string>(COUNTRY_CODES);

export function isCountryCode(value: unknown): value is CountryCode {
  return typeof value === "string" && countrySet.has(value.toUpperCase());
}

/** Normalise user or provider input to a canonical code, or null if unrecognised. */
export function toCountryCode(value: unknown): CountryCode | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return countrySet.has(code) ? (code as CountryCode) : null;
}

let displayNames: Intl.DisplayNames | null = null;

function regionNames(): Intl.DisplayNames | null {
  if (displayNames) return displayNames;
  try {
    // Pinned to English: this is stored/compared data and an operator-facing label, not a
    // localised UI string. INT-07's display locale governs presentation, not identity.
    displayNames = new Intl.DisplayNames(["en"], { type: "region" });
    return displayNames;
  } catch {
    return null;
  }
}

/** Human name for a code, falling back to the code itself rather than throwing. */
export function countryName(code: string): string {
  const normalised = toCountryCode(code);
  if (!normalised) return code;
  try {
    return regionNames()?.of(normalised) ?? normalised;
  } catch {
    return normalised;
  }
}

/** Every country as a `{ code, name }` pair, sorted by name — for a select element. */
export function countryOptions(): Array<{ code: CountryCode; name: string }> {
  return COUNTRY_CODES.map((code) => ({ code, name: countryName(code) })).sort((a, b) =>
    a.name.localeCompare(b.name, "en"),
  );
}
