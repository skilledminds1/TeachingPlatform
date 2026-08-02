import { describe, expect, it } from "vitest";

import { findMatches, namesMatch, nameTokens } from "./screening";
import { parseCsvLine, parseSdnCsv } from "@/services/compliance/sanctions-list";

/**
 * INT-13. Name screening decides whether a HUMAN looks at an approval, never whether someone
 * is guilty. The two errors are wildly asymmetric — a delayed approval versus onboarding a
 * sanctioned party — but a matcher that fires constantly is not "cautious", it is a filter
 * everyone learns to click through, so precision matters as much as recall.
 */
describe("nameTokens", () => {
  it("folds diacritics so the list and the signup form can agree", () => {
    expect(nameTokens("José Álvarez")).toEqual(["jose", "alvarez"]);
    expect(nameTokens("MUÑOZ")).toEqual(["munoz"]);
  });

  it("drops punctuation, which the SDN file uses freely", () => {
    expect(nameTokens("ANGLO-CARIBBEAN CO., LTD.")).toEqual([
      "anglo",
      "caribbean",
      "co",
      "ltd",
    ]);
  });

  it("discards single characters, which carry no matching signal", () => {
    expect(nameTokens("J Smith")).toEqual(["smith"]);
  });
});

describe("namesMatch", () => {
  it("matches regardless of order or punctuation", () => {
    expect(namesMatch("Muhammad Al-Qadi", "QADI, Muhammad Al")).toBe(true);
    expect(namesMatch("Jose Alvarez", "JOSÉ ÁLVAREZ")).toBe(true);
  });

  it("matches when the list entry carries extra names", () => {
    expect(namesMatch("Jane Smith", "SMITH, Jane Elizabeth")).toBe(true);
  });

  /**
   * The failure mode that makes a screening feature useless. "Ali" appears in thousands of
   * SDN rows; a substring or any-token match would hold every approval on the platform and
   * the hold would stop meaning anything.
   */
  it("does not fire on a single shared common token", () => {
    expect(namesMatch("Ali", "ALI, Muhammad")).toBe(false);
    expect(namesMatch("Jane Smith", "SMITH, Muhammad Ali")).toBe(false);
  });

  it("does not match unrelated names", () => {
    expect(namesMatch("Jane Smith", "BANCO NACIONAL DE CUBA")).toBe(false);
    expect(namesMatch("", "BANCO NACIONAL DE CUBA")).toBe(false);
  });
});

describe("SDN CSV parsing", () => {
  // The real file quotes names containing commas. Splitting naively truncates exactly the
  // entries most likely to matter.
  it("honours quoted fields containing commas", () => {
    expect(parseCsvLine('173,"ANGLO-CARIBBEAN CO., LTD.",-0- ,"CUBA",-0-')).toEqual([
      "173",
      "ANGLO-CARIBBEAN CO., LTD.",
      "-0-",
      "CUBA",
      "-0-",
    ]);
  });

  it("handles escaped quotes", () => {
    expect(parseCsvLine('1,"SAID ""THE FOX"" ALI",x')).toEqual([
      "1",
      'SAID "THE FOX" ALI',
      "x",
    ]);
  });

  it("parses real SDN rows and blanks the -0- placeholder", () => {
    const csv = [
      '36,"AEROCARIBBEAN AIRLINES",-0- ,"CUBA",-0- ,-0- ',
      '306,"BANCO NACIONAL DE CUBA",-0- ,"CUBA",-0- ,-0- ',
      "",
    ].join("\n");

    expect(parseSdnCsv(csv)).toEqual([
      { name: "AEROCARIBBEAN AIRLINES", programme: "CUBA", reference: "36" },
      { name: "BANCO NACIONAL DE CUBA", programme: "CUBA", reference: "306" },
    ]);
  });

  it("skips blank lines and rows with no name", () => {
    expect(parseSdnCsv("\n\n1,-0- ,-0- ,-0-\n")).toEqual([]);
  });
});

describe("findMatches", () => {
  const entries = [
    { name: "BANCO NACIONAL DE CUBA", programme: "CUBA", reference: "306" },
    { name: "SMITH, Jane Elizabeth", programme: "SDGT", reference: "999" },
  ];

  it("returns the matching entry with its programme for the audit record", () => {
    expect(findMatches("Jane Smith", entries)).toEqual([
      { name: "SMITH, Jane Elizabeth", programme: "SDGT", reference: "999" },
    ]);
  });

  it("returns nothing for an unrelated name", () => {
    expect(findMatches("Herman Sales", entries)).toEqual([]);
  });
});
