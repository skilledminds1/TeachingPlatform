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

export function localDateTimeToUtc(input: {
  date: string;
  time: string;
  timeZone: string;
}): Date {
  const value = DateTime.fromFormat(
    `${input.date} ${input.time}`,
    "yyyy-MM-dd HH:mm",
    { zone: input.timeZone },
  );
  if (!value.isValid) {
    throw new Error("Invalid date, time, or timezone.");
  }
  return value.toUTC().toJSDate();
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
