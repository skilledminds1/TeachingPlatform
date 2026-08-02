import { DateTime } from "luxon";

export const LESSON_DURATION_MINUTES = 60;

export const TIMEZONE_OPTIONS = [
  { value: "Africa/Johannesburg", label: "South Africa (SAST)" },
  { value: "Africa/Windhoek", label: "Namibia (CAT)" },
  { value: "Africa/Harare", label: "Zimbabwe / Zambia (CAT)" },
  { value: "Africa/Nairobi", label: "East Africa (EAT)" },
  { value: "Africa/Cairo", label: "Egypt (EET)" },
  { value: "Africa/Lagos", label: "West Africa (WAT)" },
  { value: "Africa/Accra", label: "Ghana (GMT)" },
  { value: "Africa/Casablanca", label: "Morocco" },
  { value: "Europe/London", label: "United Kingdom (GMT/BST)" },
  { value: "Europe/Dublin", label: "Ireland" },
  { value: "Europe/Lisbon", label: "Portugal" },
  { value: "Europe/Paris", label: "France / Spain / Netherlands" },
  { value: "Europe/Berlin", label: "Germany / Central Europe" },
  { value: "Europe/Rome", label: "Italy" },
  { value: "Europe/Amsterdam", label: "Netherlands" },
  { value: "Europe/Zurich", label: "Switzerland" },
  { value: "Europe/Stockholm", label: "Sweden" },
  { value: "Europe/Athens", label: "Greece / Eastern Europe" },
  { value: "Europe/Istanbul", label: "Turkey" },
  { value: "Europe/Moscow", label: "Russia (Moscow)" },
  { value: "America/New_York", label: "US Eastern" },
  { value: "America/Chicago", label: "US Central" },
  { value: "America/Denver", label: "US Mountain" },
  { value: "America/Los_Angeles", label: "US Pacific" },
  { value: "America/Phoenix", label: "US Arizona" },
  { value: "America/Toronto", label: "Canada Eastern" },
  { value: "America/Vancouver", label: "Canada Pacific" },
  { value: "America/Mexico_City", label: "Mexico City" },
  { value: "America/Sao_Paulo", label: "Brazil (São Paulo)" },
  { value: "America/Argentina/Buenos_Aires", label: "Argentina" },
  { value: "Asia/Dubai", label: "United Arab Emirates (GST)" },
  { value: "Asia/Riyadh", label: "Saudi Arabia" },
  { value: "Asia/Jerusalem", label: "Israel" },
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "Asia/Karachi", label: "Pakistan" },
  { value: "Asia/Dhaka", label: "Bangladesh" },
  { value: "Asia/Bangkok", label: "Thailand / Indochina" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Hong_Kong", label: "Hong Kong" },
  { value: "Asia/Shanghai", label: "China" },
  { value: "Asia/Tokyo", label: "Japan (JST)" },
  { value: "Asia/Seoul", label: "South Korea" },
  { value: "Australia/Perth", label: "Australia Western" },
  { value: "Australia/Adelaide", label: "Australia Central" },
  { value: "Australia/Sydney", label: "Australia Eastern" },
  { value: "Pacific/Auckland", label: "New Zealand" },
] as const;

export function timeValue(date: Date): string {
  return DateTime.fromJSDate(date, { zone: "utc" }).toFormat("HH:mm");
}

const LOCAL_FORMAT = "yyyy-MM-dd HH:mm";

/**
 * INT-14: what a daylight-saving transition did to a local time we were asked to store.
 *
 * Twice a year a wall-clock time is either impossible or means two different instants, and
 * Luxon resolves both cases silently — so a teacher who blocks 01:30 on a transition day
 * gets a different hour than the one they typed, with nothing to tell them.
 */
export type DstWarning = {
  kind: "nonexistent" | "ambiguous";
  zone: string;
  /** The local date and time as requested, "yyyy-MM-dd HH:mm". */
  requested: string;
  /** Plain-language explanation, safe to show a teacher. */
  message: string;
};

/**
 * Convert a local date and time to UTC, reporting any daylight-saving ambiguity.
 *
 * Neither case is an error — a value still has to be stored — so this returns the warning
 * alongside the instant rather than throwing. Callers that can surface it to a human should;
 * callers generating slots in bulk can ignore it.
 */
export function resolveLocalDateTime(input: {
  date: string;
  time: string;
  timeZone: string;
}): { utc: Date; warning: DstWarning | null } {
  const requested = `${input.date} ${input.time}`;
  const value = DateTime.fromFormat(requested, LOCAL_FORMAT, { zone: input.timeZone });
  if (!value.isValid) {
    throw new Error("Invalid date, time, or timezone.");
  }

  const utc = value.toUTC().toJSDate();

  // Spring forward deletes local times. Luxon does not reject them, it slides the result
  // forward — so the only evidence is that what came back is not what went in.
  const resolved = value.toFormat(LOCAL_FORMAT);
  if (resolved !== requested) {
    return {
      utc,
      warning: {
        kind: "nonexistent",
        zone: input.timeZone,
        requested,
        message:
          `${input.time} does not exist on ${input.date} in ${input.timeZone} — the clocks ` +
          `go forward. Saved as ${resolved.slice(11)} instead.`,
      },
    };
  }

  // Autumn back repeats them, and Luxon always takes the first. Measure the offset change
  // across the day rather than assuming a one-hour shift; some zones move by thirty minutes.
  const backwardShiftMinutes = value.minus({ days: 1 }).offset - value.plus({ days: 1 }).offset;
  if (backwardShiftMinutes > 0) {
    const alternative = value.plus({ minutes: backwardShiftMinutes });
    if (alternative.toFormat(LOCAL_FORMAT) === requested) {
      return {
        utc,
        warning: {
          kind: "ambiguous",
          zone: input.timeZone,
          requested,
          message:
            `${input.time} happens twice on ${input.date} in ${input.timeZone} — the clocks ` +
            `go back. Saved as the earlier one (UTC${value.toFormat("ZZ")}).`,
        },
      };
    }
  }

  return { utc, warning: null };
}

export function localDateTimeToUtc(input: {
  date: string;
  time: string;
  timeZone: string;
}): Date {
  return resolveLocalDateTime(input).utc;
}

/** The calendar date it is *right now* in a zone, as yyyy-MM-dd. */
export function todayInZone(timeZone: string, now = new Date()): string {
  const value = DateTime.fromJSDate(now, { zone: timeZone });
  if (!value.isValid) {
    // An unusable zone must not make every date guard reject; fall back to UTC.
    return DateTime.fromJSDate(now, { zone: "utc" }).toISODate() ?? "";
  }
  return value.toISODate() ?? "";
}

/**
 * A date-only value anchored at UTC midnight.
 *
 * `specificDate` columns hold a calendar date with no time, written as `<date>T00:00:00Z`.
 * Comparing them against an instant (`new Date()`) mixes the two kinds and drops the current
 * day for anyone whose local date differs from UTC's — see INT-14.
 */
export function dateOnlyUtc(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

/**
 * ICU has no distinct abbreviation for many zones and returns a bare offset such as "GMT+1".
 * Printing that beside the numeric offset says the same thing twice, so it is dropped.
 */
function zoneAbbreviation(value: DateTime): string | null {
  const abbreviation = value.offsetNameShort;
  if (!abbreviation || /^(GMT|UTC)/.test(abbreviation)) return null;
  return abbreviation;
}

/** Zone with its current abbreviation and offset, for telling a user which clock they are on. */
export function zoneLabel(timeZone: string, now = new Date()): string {
  const value = DateTime.fromJSDate(now, { zone: timeZone });
  if (!value.isValid) return timeZone;

  const name = timeZone.replace(/_/g, " ");
  const offset = `UTC${value.toFormat("ZZ")}`;
  const abbreviation = zoneAbbreviation(value);
  return abbreviation ? `${name} (${abbreviation}, ${offset})` : `${name} (${offset})`;
}

export function formatInTimeZone(
  date: Date,
  timeZone: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
    ...options,
  }).format(date);
}

export function dateKeyInZone(date: Date, timeZone: string): string {
  return DateTime.fromJSDate(date, { zone: timeZone }).toISODate() ?? "";
}
