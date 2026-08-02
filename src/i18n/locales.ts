/**
 * The locales the interface ships in (GLO-01).
 *
 * Pure data with no server imports, so middleware, client components, tests and the language
 * switcher all read the same list rather than three drifting copies of it.
 *
 * WHY THESE TWO. The backlog said to sequence locales off signup data. There is none —
 * every account has `country` unset and the legacy Africa/Johannesburg timezone, and
 * `teacher_languages` is empty — so this is an explicit product bet rather than a
 * measurement, and it should be revisited once real signups exist. Spanish is the first
 * market; Arabic is here to keep right-to-left honest, because RTL support that nothing
 * exercises is RTL support that does not work.
 */

export const DEFAULT_LOCALE = "en" as const;

export type LocaleDefinition = {
  /** BCP-47 tag. */
  code: string;
  /** Written in its own language — nobody looking for Arabic is scanning for "Arabic". */
  nativeName: string;
  englishName: string;
  direction: "ltr" | "rtl";
};

export const LOCALES: readonly LocaleDefinition[] = [
  { code: "en", nativeName: "English", englishName: "English", direction: "ltr" },
  { code: "es", nativeName: "Español", englishName: "Spanish", direction: "ltr" },
  { code: "ar", nativeName: "العربية", englishName: "Arabic", direction: "rtl" },
] as const;

export const LOCALE_CODES = LOCALES.map((locale) => locale.code);

export type Locale = (typeof LOCALE_CODES)[number];

/** The cookie the language switcher writes. Readable by middleware and the server. */
export const LOCALE_COOKIE = "amazing-skills-locale";

/** Accepts `unknown` so it can guard raw server-action input as well as header values. */
export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALE_CODES.includes(value);
}

export function localeDefinition(code: string): LocaleDefinition {
  return LOCALES.find((locale) => locale.code === code) ?? LOCALES[0];
}

export function directionFor(code: string): "ltr" | "rtl" {
  return localeDefinition(code).direction;
}

/**
 * Pick the best supported locale from an `Accept-Language` header.
 *
 * Hand-rolled rather than pulled from a library because the rules that matter here are small
 * and the failure mode of getting them wrong is silent. Two of them are worth stating:
 *
 *   Quality values are respected, so `en;q=0.8, es;q=0.9` is Spanish. Sorting by position
 *   instead — the obvious shortcut — gets that backwards.
 *
 *   A regional tag matches its base language: `es-419` and `es-MX` both select `es`. Without
 *   that, most real browsers fall through to English, since almost nobody sends a bare `es`.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const quality = params
        .map((param) => param.trim())
        .find((param) => param.startsWith("q="));
      const parsed = quality ? Number.parseFloat(quality.slice(2)) : 1;
      return {
        tag: tag.trim().toLowerCase(),
        quality: Number.isFinite(parsed) ? parsed : 0,
      };
    })
    .filter((entry) => entry.tag.length > 0 && entry.quality > 0)
    .sort((left, right) => right.quality - left.quality);

  for (const { tag } of ranked) {
    if (tag === "*") return DEFAULT_LOCALE;
    const exact = LOCALE_CODES.find((code) => code === tag);
    if (exact) return exact;
    const base = tag.split("-")[0];
    const byBase = LOCALE_CODES.find((code) => code === base);
    if (byBase) return byBase;
  }

  return DEFAULT_LOCALE;
}
