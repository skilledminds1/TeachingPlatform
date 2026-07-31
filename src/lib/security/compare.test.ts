import { describe, expect, it } from "vitest";

import { constantTimeEqual } from "./compare";

describe("constantTimeEqual", () => {
  it("matches identical strings", () => {
    expect(constantTimeEqual("abc123", "abc123")).toBe(true);
    expect(constantTimeEqual("", "")).toBe(true);
  });

  it("rejects different values of the same length", () => {
    expect(constantTimeEqual("abc123", "abc124")).toBe(false);
  });

  // timingSafeEqual throws on length mismatch, so the padding must not make a prefix match.
  it("rejects differing lengths without throwing", () => {
    expect(constantTimeEqual("abc", "abcdef")).toBe(false);
    expect(constantTimeEqual("abcdef", "abc")).toBe(false);
    expect(constantTimeEqual("", "a")).toBe(false);
    expect(constantTimeEqual("a", "")).toBe(false);
  });

  it("handles non-ascii without throwing", () => {
    expect(constantTimeEqual("pässwörd", "pässwörd")).toBe(true);
    expect(constantTimeEqual("pässwörd", "password")).toBe(false);
  });
});
