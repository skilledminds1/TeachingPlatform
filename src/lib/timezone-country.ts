import { toCountryCode, type CountryCode } from "@/lib/countries";

/**
 * A country guess from an IANA timezone, for pre-selecting the registration field (INT-13).
 *
 * A CONVENIENCE DEFAULT ONLY. The user picks the real value and it is theirs to change;
 * nothing downstream may treat this as evidence of residence, because a zone is not a
 * country — several zones span many, travellers carry the wrong one, and VPNs lie. It exists
 * so the common case is one fewer thing to fill in, which is the same reason INT-01 detects
 * the zone in the first place.
 *
 * Unmapped zones return null and the field simply starts empty. That is the honest outcome:
 * the tz database's own country mapping is not exposed by any JavaScript runtime API, so
 * this is a curated list covering the zones this marketplace actually sees, not all ~350.
 */
const ZONE_COUNTRY: Record<string, CountryCode> = {
  // Africa
  "Africa/Abidjan": "CI", "Africa/Accra": "GH", "Africa/Addis_Ababa": "ET",
  "Africa/Algiers": "DZ", "Africa/Cairo": "EG", "Africa/Casablanca": "MA",
  "Africa/Dar_es_Salaam": "TZ", "Africa/Harare": "ZW", "Africa/Johannesburg": "ZA",
  "Africa/Kampala": "UG", "Africa/Khartoum": "SD", "Africa/Kinshasa": "CD",
  "Africa/Lagos": "NG", "Africa/Luanda": "AO", "Africa/Lusaka": "ZM",
  "Africa/Maputo": "MZ", "Africa/Nairobi": "KE", "Africa/Tunis": "TN",
  "Africa/Windhoek": "NA",

  // Americas
  "America/Anchorage": "US", "America/Argentina/Buenos_Aires": "AR", "America/Bogota": "CO",
  "America/Caracas": "VE", "America/Chicago": "US", "America/Denver": "US",
  "America/Edmonton": "CA", "America/Guatemala": "GT", "America/Halifax": "CA",
  "America/Havana": "CU", "America/Lima": "PE", "America/Los_Angeles": "US",
  "America/Mexico_City": "MX", "America/Montevideo": "UY", "America/New_York": "US",
  "America/Panama": "PA", "America/Phoenix": "US", "America/Puerto_Rico": "PR",
  "America/Santiago": "CL", "America/Sao_Paulo": "BR", "America/St_Johns": "CA",
  "America/Toronto": "CA", "America/Vancouver": "CA", "America/Winnipeg": "CA",

  // Asia
  "Asia/Almaty": "KZ", "Asia/Amman": "JO", "Asia/Baghdad": "IQ", "Asia/Baku": "AZ",
  "Asia/Bangkok": "TH", "Asia/Beirut": "LB", "Asia/Colombo": "LK", "Asia/Damascus": "SY",
  "Asia/Dhaka": "BD", "Asia/Dubai": "AE", "Asia/Ho_Chi_Minh": "VN", "Asia/Hong_Kong": "HK",
  "Asia/Jakarta": "ID", "Asia/Jerusalem": "IL", "Asia/Kabul": "AF", "Asia/Karachi": "PK",
  "Asia/Kathmandu": "NP", "Asia/Kolkata": "IN", "Asia/Kuala_Lumpur": "MY",
  "Asia/Kuwait": "KW", "Asia/Manila": "PH", "Asia/Muscat": "OM", "Asia/Phnom_Penh": "KH",
  "Asia/Pyongyang": "KP", "Asia/Qatar": "QA", "Asia/Riyadh": "SA", "Asia/Seoul": "KR",
  "Asia/Shanghai": "CN", "Asia/Singapore": "SG", "Asia/Taipei": "TW", "Asia/Tashkent": "UZ",
  "Asia/Tbilisi": "GE", "Asia/Tehran": "IR", "Asia/Tokyo": "JP", "Asia/Yangon": "MM",
  "Asia/Yerevan": "AM",

  // Europe
  "Atlantic/Reykjavik": "IS", "Europe/Amsterdam": "NL", "Europe/Athens": "GR",
  "Europe/Belgrade": "RS", "Europe/Berlin": "DE", "Europe/Bratislava": "SK",
  "Europe/Brussels": "BE", "Europe/Bucharest": "RO", "Europe/Budapest": "HU",
  "Europe/Copenhagen": "DK", "Europe/Dublin": "IE", "Europe/Helsinki": "FI",
  "Europe/Istanbul": "TR", "Europe/Kyiv": "UA", "Europe/Lisbon": "PT",
  "Europe/Ljubljana": "SI", "Europe/London": "GB", "Europe/Luxembourg": "LU",
  "Europe/Madrid": "ES", "Europe/Malta": "MT", "Europe/Minsk": "BY", "Europe/Moscow": "RU",
  "Europe/Oslo": "NO", "Europe/Paris": "FR", "Europe/Prague": "CZ", "Europe/Riga": "LV",
  "Europe/Rome": "IT", "Europe/Sofia": "BG", "Europe/Stockholm": "SE", "Europe/Tallinn": "EE",
  "Europe/Vienna": "AT", "Europe/Vilnius": "LT", "Europe/Warsaw": "PL", "Europe/Zagreb": "HR",
  "Europe/Zurich": "CH",

  // Oceania
  "Australia/Adelaide": "AU", "Australia/Brisbane": "AU", "Australia/Melbourne": "AU",
  "Australia/Perth": "AU", "Australia/Sydney": "AU", "Pacific/Auckland": "NZ",
  "Pacific/Fiji": "FJ", "Pacific/Honolulu": "US", "Pacific/Port_Moresby": "PG",
};

/** Best-effort country for an IANA zone, or null when we genuinely do not know. */
export function countryForTimeZone(timeZone: string | null | undefined): CountryCode | null {
  if (!timeZone) return null;
  return toCountryCode(ZONE_COUNTRY[timeZone.trim()]) ?? null;
}

/** Every zone this map covers, for tests and diagnostics. */
export function mappedTimeZones(): string[] {
  return Object.keys(ZONE_COUNTRY);
}
