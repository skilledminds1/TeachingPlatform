/**
 * Teaching languages (INT-10).
 *
 * Codes are BCP-47. Display names come from `Intl.DisplayNames`, so we get every language
 * in the user's own locale for free instead of maintaining a translation table — and adding
 * a language is a one-line change here rather than a data migration.
 */

export const LANGUAGE_PROFICIENCIES = [
  { value: "native", label: "Native" },
  { value: "fluent", label: "Fluent" },
  { value: "advanced", label: "Advanced" },
  { value: "conversational", label: "Conversational" },
] as const;

export type LanguageProficiency = (typeof LANGUAGE_PROFICIENCIES)[number]["value"];

/**
 * Languages offered in the teacher profile editor and the marketplace filter.
 *
 * Chosen for online-tutoring supply and demand rather than raw speaker counts: the major
 * teaching languages, plus the languages of the biggest tutor-supply markets. This is a
 * starting set — extend it from real signup data rather than guessing.
 */
export const TEACHING_LANGUAGES = [
  "en", "es", "fr", "de", "it", "pt", "pt-BR", "nl", "sv", "no", "da", "fi", "pl", "cs",
  "uk", "ru", "ro", "el", "hu", "tr", "ar", "he", "fa", "hi", "ur", "bn", "ta", "te",
  "zh", "zh-TW", "ja", "ko", "th", "vi", "id", "ms", "tl", "sw", "af", "zu", "xh", "st",
] as const;

export type TeachingLanguage = (typeof TEACHING_LANGUAGES)[number];

const languageSet = new Set<string>(TEACHING_LANGUAGES);

export function isTeachingLanguage(value: unknown): value is TeachingLanguage {
  return typeof value === "string" && languageSet.has(value);
}

let displayNames: Intl.DisplayNames | null = null;

/** Human-readable language name, e.g. "pt-BR" -> "Brazilian Portuguese". */
export function languageName(code: string, locale = "en"): string {
  try {
    displayNames ??= new Intl.DisplayNames([locale], { type: "language" });
    return displayNames.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Every offered language with its display name, sorted for a picker. */
export function teachingLanguageOptions(
  locale = "en",
): Array<{ code: TeachingLanguage; name: string }> {
  return TEACHING_LANGUAGES.map((code) => ({ code, name: languageName(code, locale) })).sort(
    (a, b) => a.name.localeCompare(b.name, locale),
  );
}

export function proficiencyLabel(value: string): string {
  return LANGUAGE_PROFICIENCIES.find((item) => item.value === value)?.label ?? value;
}

/**
 * Narrow rows loaded from the database into the shape the profile form accepts.
 *
 * The column is a plain string, so a code retired from TEACHING_LANGUAGES (or written by an
 * older release) would otherwise reach the form and fail validation on a field the teacher
 * never touched. Dropping unknown codes here means the form always opens in a valid state
 * and the teacher simply re-picks that language if they still teach it.
 */
export function toEditableLanguages(
  rows: Array<{ code: string; proficiency: string }>,
): Array<{ code: TeachingLanguage; proficiency: LanguageProficiency }> {
  const valid: Array<{ code: TeachingLanguage; proficiency: LanguageProficiency }> = [];
  for (const row of rows) {
    if (!isTeachingLanguage(row.code)) continue;
    const proficiency = LANGUAGE_PROFICIENCIES.find((item) => item.value === row.proficiency);
    valid.push({ code: row.code, proficiency: proficiency?.value ?? "conversational" });
  }
  return valid;
}
