import { describe, expect, it } from "vitest";

import { clientIdentityFromHeaders } from "./action-rate-limit";

/**
 * SEC-07 regression guard.
 *
 * The rate-limit bucket key previously used `x-forwarded-for.split(",")[0]` — the leftmost
 * hop, which is whatever the client sent. Varying that header per request produced a fresh
 * bucket every time, defeating the sign-in, sign-up and password-reset caps entirely even
 * when the shared Redis store was healthy.
 */

const headersFrom = (values: Record<string, string>) => new Headers(values);

describe("clientIdentityFromHeaders", () => {
  it("prefers the platform-set header, which a client cannot forge", () => {
    const headers = headersFrom({
      "x-vercel-forwarded-for": "203.0.113.9",
      "x-forwarded-for": "1.1.1.1, 203.0.113.9",
      "x-real-ip": "9.9.9.9",
    });
    expect(clientIdentityFromHeaders(headers)).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip before parsing forwarded-for", () => {
    const headers = headersFrom({
      "x-real-ip": "203.0.113.9",
      "x-forwarded-for": "1.1.1.1, 203.0.113.9",
    });
    expect(clientIdentityFromHeaders(headers)).toBe("203.0.113.9");
  });

  // The core fix: our own edge appends the real client IP last, so the rightmost hop is the
  // only one an attacker cannot control.
  it("takes the rightmost forwarded hop, not the client-supplied leftmost one", () => {
    expect(
      clientIdentityFromHeaders(headersFrom({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" })),
    ).toBe("203.0.113.9");
  });

  it("gives one stable bucket however the attacker varies the spoofed prefix", () => {
    const identities = [
      "1.1.1.1, 203.0.113.9",
      "2.2.2.2, 203.0.113.9",
      "3.3.3.3, 10.0.0.1, 203.0.113.9",
    ].map((value) => clientIdentityFromHeaders(headersFrom({ "x-forwarded-for": value })));

    expect(new Set(identities).size).toBe(1);
    expect(identities[0]).toBe("203.0.113.9");
  });

  it("handles a single-hop header and surrounding whitespace", () => {
    expect(
      clientIdentityFromHeaders(headersFrom({ "x-forwarded-for": "  203.0.113.9  " })),
    ).toBe("203.0.113.9");
  });

  it("returns null when no forwarding information is present", () => {
    expect(clientIdentityFromHeaders(headersFrom({}))).toBeNull();
    expect(clientIdentityFromHeaders(headersFrom({ "x-forwarded-for": "" }))).toBeNull();
    expect(clientIdentityFromHeaders(headersFrom({ "x-forwarded-for": " , " }))).toBeNull();
  });
});
