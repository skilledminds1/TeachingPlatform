/**
 * Age, and the one question the platform actually asks of it: is this person a child?
 *
 * POPIA s35 requires the consent of a "competent person" to process a child's personal
 * information and defines a child as anyone under 18. GDPR Art 8 puts its digital-consent age
 * between 13 and 16 depending on member state. 18 is the stricter of the two, so implementing
 * it satisfies both without branching on residence.
 */

/** POPIA's definition, and the one this platform uses everywhere. */
export const ADULT_AGE = 18;

/**
 * Whole years between two dates, in calendar terms.
 *
 * Deliberately not `(now - dob) / 365.25 days`: that is wrong on leap years and wrong by up to
 * a day either side of every birthday, and "up to a day either side" is exactly the boundary
 * this function exists to decide. Compares year, then month, then day, which is how a birthday
 * actually works.
 *
 * Both dates are read in UTC. `dateOfBirth` is a DATE column with no time component, so there
 * is no local midnight to disagree about.
 */
export function ageInYears(dateOfBirth: Date, now = new Date()): number {
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dateOfBirth.getUTCDate())) {
    age -= 1;
  }
  return age;
}

/**
 * Is this account holder a child?
 *
 * Returns `null` — not `false` — when the date of birth is unknown, and callers must handle
 * that third case explicitly. Accounts created before this field existed have no date of
 * birth, and treating "not stated" as "adult" is precisely the assumption the old
 * `confirmedAdult` checkbox made: it defaulted to true, nothing ever verified it, and the
 * Terms claimed 18+ on that basis. An unknown age is unverified, and gates treat it as such.
 */
export function isMinor(dateOfBirth: Date | null | undefined, now = new Date()): boolean | null {
  if (!dateOfBirth) return null;
  return ageInYears(dateOfBirth, now) < ADULT_AGE;
}

/**
 * The oldest date of birth that still makes someone a child today, for querying minors in SQL
 * without recomputing ages in JavaScript over every row.
 */
export function minorDateOfBirthCutoff(now = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - ADULT_AGE);
  return cutoff;
}

/** Rejects an implausible date rather than storing it and failing a gate later. */
export function isPlausibleDateOfBirth(dateOfBirth: Date, now = new Date()): boolean {
  if (Number.isNaN(dateOfBirth.getTime())) return false;
  if (dateOfBirth > now) return false;
  return ageInYears(dateOfBirth, now) <= 120;
}
