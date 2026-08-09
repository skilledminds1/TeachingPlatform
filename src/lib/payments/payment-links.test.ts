import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  normalizePaymentLinkUrl,
  paymentLinkProvidersForCountry,
  PAYMENT_LINK_PROVIDERS,
} from "./payment-links";

/**
 * The stored payment link is rendered as an href on a page carrying the platform's branding,
 * and it is chosen by a teacher. A taken-over account turns that into a phishing page or a
 * laundering storefront, so these are the assertions that keep it a redirect to a regulated
 * checkout and nothing else.
 */

describe("normalizePaymentLinkUrl", () => {
  it("accepts an allowlisted host", () => {
    const result = normalizePaymentLinkUrl("https://buy.stripe.com/test_abc123");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.link.host).toBe("buy.stripe.com");
      expect(result.link.providerId).toBe("stripe_payment_link");
    }
  });

  it("rejects a lookalike subdomain, which a startsWith check would accept", () => {
    // https://buy.stripe.com.evil.com/ starts with "https://buy.stripe.com" as a string.
    const result = normalizePaymentLinkUrl("https://buy.stripe.com.evil.com/pay");
    expect(result).toEqual({ ok: false, reason: "host_not_allowed" });
  });

  it("rejects a host embedded in the path", () => {
    expect(normalizePaymentLinkUrl("https://evil.com/buy.stripe.com/pay")).toEqual({
      ok: false,
      reason: "host_not_allowed",
    });
  });

  it("rejects userinfo that makes the host look allowlisted to a human", () => {
    // Parses with hostname evil.com; a reader sees "buy.stripe.com".
    expect(normalizePaymentLinkUrl("https://buy.stripe.com@evil.com/pay")).toEqual({
      ok: false,
      reason: "has_credentials",
    });
  });

  it("rejects javascript: and data:, which z.url() accepts", () => {
    expect(normalizePaymentLinkUrl("javascript:alert(1)")).toEqual({
      ok: false,
      reason: "not_https",
    });
    expect(normalizePaymentLinkUrl("data:text/html,<script>alert(1)</script>")).toEqual({
      ok: false,
      reason: "not_https",
    });
  });

  it("rejects plain http", () => {
    expect(normalizePaymentLinkUrl("http://buy.stripe.com/x")).toEqual({
      ok: false,
      reason: "not_https",
    });
  });

  it("rejects a shortener, however convenient", () => {
    // A shortener is an allowlist bypass with extra steps: the real destination is invisible
    // to both the platform and the student.
    expect(normalizePaymentLinkUrl("https://bit.ly/pay-me")).toEqual({
      ok: false,
      reason: "host_not_allowed",
    });
  });

  it("strips the fragment by rebuilding from parsed parts", () => {
    const result = normalizePaymentLinkUrl("https://buy.stripe.com/abc#not-this");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.link.url).toBe("https://buy.stripe.com/abc");
  });

  it("preserves the query, which several providers use to carry the link id", () => {
    const result = normalizePaymentLinkUrl("https://paystack.com/pay/x?ref=1");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.link.url).toBe("https://paystack.com/pay/x?ref=1");
  });

  it("is case-insensitive on the host but does not accept a different one", () => {
    expect(normalizePaymentLinkUrl("https://BUY.STRIPE.COM/x").ok).toBe(true);
    expect(normalizePaymentLinkUrl("https://buy.stripe.co/x").ok).toBe(false);
  });
});

describe("paymentLinkProvidersForCountry", () => {
  it("offers South African teachers local options", () => {
    const ids = paymentLinkProvidersForCountry("ZA").map((p) => p.id);
    expect(ids).toContain("yoco");
    expect(ids).toContain("payfast");
    // Stripe does not onboard South African businesses, so it must not be offered there.
    expect(ids).not.toContain("stripe_payment_link");
  });

  it("falls back to global providers when the country is unknown", () => {
    const ids = paymentLinkProvidersForCountry(null).map((p) => p.id);
    expect(ids).toContain("wise");
    expect(ids).not.toContain("yoco");
  });

  /**
   * PayPal.Me was removed on 9 August 2026 with the rest of the PayPal rail. Global coverage
   * has to survive it, or a teacher outside the listed countries is left with nothing to
   * paste and no way to be paid at all.
   */
  it("still offers a global option to a teacher in an unlisted country", () => {
    expect(paymentLinkProvidersForCountry("JP").length).toBeGreaterThan(0);
    expect(paymentLinkProvidersForCountry(null).length).toBeGreaterThan(0);
  });
});

describe("the provider table itself", () => {
  it("has lowercase hosts, since matching is by lowercase equality", () => {
    for (const provider of PAYMENT_LINK_PROVIDERS) {
      for (const host of provider.hosts) {
        expect(host).toBe(host.toLowerCase());
      }
    }
  });

  it("has no duplicate host across providers, which would make attribution ambiguous", () => {
    const hosts = PAYMENT_LINK_PROVIDERS.flatMap((p) => p.hosts);
    expect(new Set(hosts).size).toBe(hosts.length);
  });
});

/**
 * The platform does not process, verify, hold or guarantee a lesson payment. Saying otherwise
 * on the page that sends a student to pay is what converts a redirect into a representation,
 * and a representation into liability the zero-touch model cannot carry.
 */
describe("payment copy makes no promise the platform cannot keep", () => {
  const BANNED = [
    "secure payment",
    "payment protection",
    "buyer protection",
    "guaranteed",
    "we verify",
    "verified payment",
    "money-back",
  ];

  function filesUnder(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      return statSync(full).isDirectory() ? filesUnder(full) : [full];
    });
  }

  it("contains none of the banned phrases in src/features/payments", () => {
    const offenders: string[] = [];
    for (const file of filesUnder(join(process.cwd(), "src", "features", "payments"))) {
      if (!file.endsWith(".tsx") && !file.endsWith(".ts")) continue;
      const text = readFileSync(file, "utf8").toLowerCase();
      for (const phrase of BANNED) {
        if (text.includes(phrase)) offenders.push(`${file}: "${phrase}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
