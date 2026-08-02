import { readFileSync, readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_CODES,
  directionFor,
  isSupportedLocale,
  negotiateLocale,
} from "./locales";

/**
 * Interface internationalisation (GLO-01).
 *
 * The failures this guards against are all silent. A key present in English and missing in
 * Arabic renders a fragment of a key path to a real visitor. A plural written as
 * `n === 1 ? "" : "s"` produces grammatical nonsense in a language with six plural forms. A
 * locale negotiated by first-listed rather than by quality value serves the wrong language to
 * someone who explicitly ranked their preference. None of it throws.
 */

type Messages = Record<string, unknown>;

const read = (locale: string): Messages =>
  JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as Messages;

/** Every leaf key, dotted — `nav.signIn` rather than the nested object. */
function flatten(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value as Messages).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key),
  );
}

const source = read(DEFAULT_LOCALE);
const sourceKeys = flatten(source).sort();

describe("catalogue parity", () => {
  it("ships a catalogue for every declared locale, and no extras", () => {
    const files = readdirSync("messages")
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.replace(/\.json$/, ""))
      .sort();

    expect(files).toEqual([...LOCALE_CODES].sort());
  });

  /**
   * THE BUILD-FAILING CHECK the backlog asks for. A missing key does not throw at runtime —
   * next-intl falls back — so without this a locale ships half-translated and nobody notices
   * until a user does.
   */
  it.each(LOCALE_CODES.filter((code) => code !== DEFAULT_LOCALE))(
    "%s translates every key in the source catalogue",
    (locale) => {
      const translated = flatten(read(locale)).sort();

      const missing = sourceKeys.filter((key) => !translated.includes(key));
      const extra = translated.filter((key) => !sourceKeys.includes(key));

      expect(missing, `${locale} is missing keys`).toEqual([]);
      expect(extra, `${locale} has keys English does not`).toEqual([]);
    },
  );

  /**
   * A copied catalogue passes the parity check above while still being entirely English.
   * Requiring most values to differ catches the "translated by duplicating the file" case.
   * Brand names and a few shared tokens legitimately match, so this is a proportion rather
   * than a per-key rule.
   */
  it.each(LOCALE_CODES.filter((code) => code !== DEFAULT_LOCALE))(
    "%s is actually translated, not a copy of English",
    (locale) => {
      const translated = read(locale);
      const identical = sourceKeys.filter((key) => {
        const get = (obj: Messages) =>
          key.split(".").reduce<unknown>((acc, part) => (acc as Messages)?.[part], obj);
        return get(source) === get(translated);
      });

      expect(identical.length / sourceKeys.length).toBeLessThan(0.15);
    },
  );
});

describe("plural forms", () => {
  /**
   * English has two plural categories; Arabic has six. Any message with a count has to be an
   * ICU plural in every catalogue, or the translation cannot express its own grammar.
   */
  const pluralKeys = sourceKeys.filter((key) =>
    String(
      key.split(".").reduce<unknown>((acc, part) => (acc as Messages)?.[part], source),
    ).includes("{count, plural,"),
  );

  it("has at least one pluralised message to check", () => {
    expect(pluralKeys.length).toBeGreaterThan(0);
  });

  it.each(LOCALE_CODES)("%s keeps counts as ICU plurals", (locale) => {
    const messages = read(locale);
    for (const key of pluralKeys) {
      const value = String(
        key.split(".").reduce<unknown>((acc, part) => (acc as Messages)?.[part], messages),
      );
      expect(value, `${locale}.${key} must stay an ICU plural`).toContain("{count, plural,");
    }
  });

  /** Arabic without `few`/`many` silently falls back to `other` for 3–10 and 11–99. */
  it("uses Arabic's own plural categories, not English's two", () => {
    const arabic = read("ar");
    for (const key of pluralKeys) {
      const value = String(
        key.split(".").reduce<unknown>((acc, part) => (acc as Messages)?.[part], arabic),
      );
      for (const category of ["zero", "one", "two", "few", "many", "other"]) {
        expect(value, `ar.${key} is missing the "${category}" form`).toContain(`${category} {`);
      }
    }
  });
});

describe("locale negotiation", () => {
  it("falls back to English with no header", () => {
    expect(negotiateLocale(null)).toBe("en");
    expect(negotiateLocale("")).toBe("en");
  });

  it("matches a regional tag to its base language", () => {
    // Almost nobody sends a bare "es"; without this, real browsers all get English.
    expect(negotiateLocale("es-MX,es;q=0.9")).toBe("es");
    expect(negotiateLocale("es-419")).toBe("es");
    expect(negotiateLocale("ar-EG")).toBe("ar");
  });

  // Sorting by position instead of quality — the obvious shortcut — gets this backwards.
  it("respects quality values rather than order", () => {
    expect(negotiateLocale("en;q=0.8, es;q=0.9")).toBe("es");
    expect(negotiateLocale("fr;q=1.0, ar;q=0.5")).toBe("ar");
  });

  it("ignores a zero-quality language", () => {
    expect(negotiateLocale("es;q=0, en;q=0.5")).toBe("en");
  });

  it("falls back for languages that are not shipped", () => {
    expect(negotiateLocale("de-DE,de;q=0.9")).toBe("en");
    expect(negotiateLocale("*")).toBe("en");
  });
});

describe("locale metadata", () => {
  it("knows which locales are right-to-left", () => {
    expect(directionFor("ar")).toBe("rtl");
    expect(directionFor("en")).toBe("ltr");
    expect(directionFor("es")).toBe("ltr");
    // An unknown code must not produce `undefined` on the <html dir> attribute.
    expect(directionFor("zz")).toBe("ltr");
  });

  it("ships at least one RTL locale, so RTL is actually exercised", () => {
    expect(LOCALES.some((locale) => locale.direction === "rtl")).toBe(true);
  });

  /** Someone who landed on the wrong language cannot read that language's name for theirs. */
  it("names every locale in its own language", () => {
    for (const locale of LOCALES) {
      expect(locale.nativeName.length).toBeGreaterThan(0);
    }
    expect(LOCALES.find((l) => l.code === "ar")?.nativeName).not.toMatch(/^[a-z]+$/i);
    expect(LOCALES.find((l) => l.code === "es")?.nativeName).toBe("Español");
  });

  it("guards unknown input", () => {
    expect(isSupportedLocale("en")).toBe(true);
    expect(isSupportedLocale("klingon")).toBe(false);
    expect(isSupportedLocale(null)).toBe(false);
    expect(isSupportedLocale(42)).toBe(false);
  });
});

describe("the document reflects the locale", () => {
  const layout = readFileSync("src/app/layout.tsx", "utf8");

  /**
   * `lang` was the literal "en" and `dir` was absent, so a screen reader announced Arabic in
   * an English voice and RTL text laid out left-to-right.
   */
  it("sets lang and dir from the resolved locale", () => {
    expect(layout).toContain("lang={locale}");
    expect(layout).toContain("dir={direction}");
    expect(layout).not.toContain('lang="en"');
  });

  it("provides the catalogue to client components", () => {
    expect(layout).toContain("NextIntlClientProvider");
  });
});
