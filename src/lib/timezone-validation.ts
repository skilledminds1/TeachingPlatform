/**
 * IANA timezone validation, shared by every path that stores a zone.
 *
 * INT-02: the two write paths disagreed. Teacher onboarding accepted free text, while the
 * student settings form validated against a hand-curated 47-entry allowlist — opposite
 * contracts on the same column. The allowlist was also Africa-first and incomplete, so a
 * teacher in Manila literally could not store their own zone.
 *
 * `Intl.supportedValuesOf` is the authoritative list the runtime already ships, so there is
 * nothing to hand-maintain and nothing to go stale.
 */

let cachedZones: Set<string> | null = null;

/** Every IANA zone the runtime knows about. */
export function supportedTimeZones(): string[] {
  return [...zoneSet()].sort();
}

function zoneSet(): Set<string> {
  if (cachedZones) return cachedZones;
  try {
    cachedZones = new Set(Intl.supportedValuesOf("timeZone"));
  } catch {
    cachedZones = new Set<string>();
  }
  return cachedZones;
}

export function isValidIanaTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;

  // Fast path for the canonical list.
  if (zoneSet().has(value)) return true;

  // Authoritative check. `supportedValuesOf` returns only canonical region zones, so it
  // omits values the runtime nonetheless accepts and formats correctly — "UTC" is the
  // obvious one, and aliases like "Asia/Calcutta" are others. Treating the set as the sole
  // authority would reject legitimate stored values and block users from saving.
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Current UTC offset label for a zone, e.g. "UTC+02:00" — for building a readable picker. */
export function timeZoneOffsetLabel(timeZone: string, now = new Date()): string {
  try {
    const formatted = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      timeZoneName: "longOffset",
    }).formatToParts(now);
    return formatted.find((part) => part.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}
