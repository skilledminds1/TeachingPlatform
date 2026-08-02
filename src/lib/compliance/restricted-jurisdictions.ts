import { toCountryCode, type CountryCode } from "@/lib/countries";

/**
 * Jurisdictions the platform will not onboard (INT-13).
 *
 * THIS IS AN ENGINEERING CONTROL, NOT LEGAL ADVICE. It encodes the four countries subject to
 * comprehensive US sanctions programmes, which is the list every payment provider this
 * platform might use already refuses. It is deliberately the narrow, uncontroversial set:
 * PRD-05 commissions the professional opinion that decides the real policy, and this file is
 * where that decision lands when it arrives.
 *
 * Two limits worth stating plainly rather than discovering later:
 *
 *  1. SUB-NATIONAL REGIONS CANNOT BE EXPRESSED HERE. The comprehensive programmes also cover
 *     the Crimea, Donetsk and Luhansk regions of Ukraine, which have no ISO 3166-1 alpha-2
 *     code of their own. A user in those regions selects UA and passes this check. Closing
 *     that needs region-level data this platform does not collect.
 *
 *  2. SECTORAL PROGRAMMES ARE NOT HERE EITHER. Russia and Belarus carry extensive sectoral
 *     restrictions rather than comprehensive embargoes, so blocking them outright is a
 *     business decision with real cost to legitimate teachers — not something to smuggle in
 *     as a technical default. Left out until PRD-05 says otherwise.
 *
 * The check is a floor, not a substitute for the provider's own screening at payout.
 */
export const RESTRICTED_JURISDICTIONS: readonly CountryCode[] = [
  "CU", // Cuba
  "IR", // Iran
  "KP", // North Korea
  "SY", // Syria
] as const;

const restricted = new Set<string>(RESTRICTED_JURISDICTIONS);

/** True when the platform will not onboard from this country. Unknown input is NOT blocked. */
export function isRestrictedJurisdiction(country: unknown): boolean {
  const code = toCountryCode(country);
  // An unrecognised or missing country is not a block: it is a different failure, handled by
  // requiring a valid country at registration. Blocking on "unknown" would refuse people
  // whose country simply failed to parse.
  return code !== null && restricted.has(code);
}

/** Message shown when onboarding is refused. Deliberately free of accusation. */
export function restrictedJurisdictionMessage(country: unknown): string {
  const code = toCountryCode(country);
  return (
    `We are unable to offer accounts in ${code ?? "this location"} because of sanctions ` +
    `restrictions that apply to our payment providers. If you believe this is a mistake, ` +
    `contact support.`
  );
}
