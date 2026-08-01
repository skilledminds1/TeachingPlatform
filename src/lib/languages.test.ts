import { describe, expect, it } from "vitest";

import {
  isTeachingLanguage,
  languageName,
  TEACHING_LANGUAGES,
  teachingLanguageOptions,
  toEditableLanguages,
} from "./languages";

describe("teaching languages", () => {
  it("offers the major teaching and tutor-supply languages", () => {
    for (const code of ["en", "es", "fr", "pt-BR", "zh", "ar", "hi", "tl", "id", "uk"]) {
      expect(isTeachingLanguage(code), `${code} should be offered`).toBe(true);
    }
  });

  it("rejects anything not on the list", () => {
    expect(isTeachingLanguage("xx")).toBe(false);
    expect(isTeachingLanguage("")).toBe(false);
    expect(isTeachingLanguage(null)).toBe(false);
    expect(isTeachingLanguage(42)).toBe(false);
  });

  it("has no duplicate codes", () => {
    expect(new Set(TEACHING_LANGUAGES).size).toBe(TEACHING_LANGUAGES.length);
  });
});

describe("languageName", () => {
  it("resolves human-readable names from Intl rather than a hand-maintained table", () => {
    expect(languageName("en")).toMatch(/English/i);
    expect(languageName("pt-BR")).toMatch(/Portuguese/i);
  });

  it("falls back to the code for anything unresolvable", () => {
    expect(languageName("zzz")).toBe("zzz");
  });
});

describe("teachingLanguageOptions", () => {
  it("returns every offered language, sorted by display name", () => {
    const options = teachingLanguageOptions();
    expect(options).toHaveLength(TEACHING_LANGUAGES.length);

    const names = options.map((option) => option.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

describe("toEditableLanguages", () => {
  it("passes through valid rows", () => {
    expect(
      toEditableLanguages([{ code: "es", proficiency: "native" }]),
    ).toEqual([{ code: "es", proficiency: "native" }]);
  });

  // A code retired from the list (or written by an older release) would otherwise reach the
  // profile form and fail validation on a field the teacher never touched.
  it("drops codes no longer offered", () => {
    expect(
      toEditableLanguages([
        { code: "en", proficiency: "fluent" },
        { code: "xx-retired", proficiency: "fluent" },
      ]),
    ).toEqual([{ code: "en", proficiency: "fluent" }]);
  });

  it("falls back to a safe proficiency for an unrecognised value", () => {
    expect(toEditableLanguages([{ code: "en", proficiency: "wizard" }])).toEqual([
      { code: "en", proficiency: "conversational" },
    ]);
  });

  it("returns an empty list for empty input", () => {
    expect(toEditableLanguages([])).toEqual([]);
  });
});
