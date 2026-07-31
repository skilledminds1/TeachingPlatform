import { describe, expect, it } from "vitest";

import { safeRedirectPath, safeRedirectPathOr } from "./redirect";

const ORIGIN = "https://app.amazingskills.co.za";

describe("safeRedirectPath", () => {
  it("allows same-origin paths and preserves query and hash", () => {
    expect(safeRedirectPath("/dashboard", ORIGIN)).toBe("/dashboard");
    expect(safeRedirectPath("/dashboard?tab=bookings", ORIGIN)).toBe("/dashboard?tab=bookings");
    expect(safeRedirectPath("/dashboard#notes", ORIGIN)).toBe("/dashboard#notes");
    expect(safeRedirectPath("/courses/intro-to-maths", ORIGIN)).toBe("/courses/intro-to-maths");
  });

  it("allows an absolute URL that is genuinely same-origin, reduced to a path", () => {
    expect(safeRedirectPath(`${ORIGIN}/dashboard?a=1`, ORIGIN)).toBe("/dashboard?a=1");
  });

  // The regression this helper exists for: the WHATWG URL parser treats a backslash as a
  // slash for special schemes, so the previous `startsWith("//")` guard let these through
  // and `new URL(path, origin)` then resolved them to an attacker's host.
  it("rejects backslash-based authority escapes", () => {
    expect(safeRedirectPath(String.raw`/\evil.com`, ORIGIN)).toBeNull();
    expect(safeRedirectPath(String.raw`/\/evil.com`, ORIGIN)).toBeNull();
    expect(safeRedirectPath(String.raw`\\evil.com`, ORIGIN)).toBeNull();
    expect(safeRedirectPath(String.raw`/\@evil.com`, ORIGIN)).toBeNull();
  });

  it("rejects protocol-relative and absolute cross-origin URLs", () => {
    expect(safeRedirectPath("//evil.com", ORIGIN)).toBeNull();
    expect(safeRedirectPath("///evil.com", ORIGIN)).toBeNull();
    expect(safeRedirectPath("https://evil.com", ORIGIN)).toBeNull();
    expect(safeRedirectPath("http://evil.com/path", ORIGIN)).toBeNull();
    expect(safeRedirectPath(`https://evil.com?next=${ORIGIN}`, ORIGIN)).toBeNull();
  });

  it("rejects a different port or scheme on the same host", () => {
    expect(safeRedirectPath("https://app.amazingskills.co.za:8443/x", ORIGIN)).toBeNull();
    expect(safeRedirectPath("http://app.amazingskills.co.za/x", ORIGIN)).toBeNull();
  });

  it("rejects a host that merely starts with the app host", () => {
    expect(safeRedirectPath("https://app.amazingskills.co.za.evil.com/x", ORIGIN)).toBeNull();
  });

  it("rejects non-http schemes", () => {
    expect(safeRedirectPath("javascript:alert(1)", ORIGIN)).toBeNull();
    expect(safeRedirectPath("data:text/html,<h1>x</h1>", ORIGIN)).toBeNull();
  });

  it("rejects empty and non-string input", () => {
    expect(safeRedirectPath("", ORIGIN)).toBeNull();
    expect(safeRedirectPath(null, ORIGIN)).toBeNull();
    expect(safeRedirectPath(undefined, ORIGIN)).toBeNull();
  });

  it("returns null rather than throwing on an unparseable origin", () => {
    expect(safeRedirectPath("/dashboard", "not-a-url")).toBeNull();
  });
});

describe("safeRedirectPathOr", () => {
  it("falls back when the path is unsafe or missing", () => {
    expect(safeRedirectPathOr(String.raw`/\evil.com`, "/dashboard", ORIGIN)).toBe("/dashboard");
    expect(safeRedirectPathOr(null, "/dashboard", ORIGIN)).toBe("/dashboard");
  });

  it("passes a safe path through", () => {
    expect(safeRedirectPathOr("/dashboard/teacher", "/dashboard", ORIGIN)).toBe(
      "/dashboard/teacher",
    );
  });
});
