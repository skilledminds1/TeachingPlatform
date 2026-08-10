import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy, generateCspNonce } from "./csp";
import { VIDEO_EMBED_HOSTS } from "./urls";

function directive(policy: string, name: string): string {
  return policy.split("; ").find((part) => part.startsWith(`${name} `)) ?? "";
}

const production = buildContentSecurityPolicy({ nonce: "TESTNONCE", isProduction: true });
const development = buildContentSecurityPolicy({ nonce: "TESTNONCE", isProduction: false });

describe("production script-src", () => {
  const scriptSrc = directive(production, "script-src");

  // The whole point of SEC-12: with 'unsafe-inline' present, any injected markup that
  // reaches the DOM executes, and the policy buys nothing.
  it("does not allow unsafe-inline or unsafe-eval", () => {
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it("carries the per-request nonce and strict-dynamic", () => {
    expect(scriptSrc).toContain("'nonce-TESTNONCE'");
    expect(scriptSrc).toContain("'strict-dynamic'");
  });
});

describe("development script-src", () => {
  const scriptSrc = directive(development, "script-src");

  // React Refresh needs eval, and the dev overlay injects un-nonced scripts.
  it("relaxes for the dev overlay and fast refresh", () => {
    expect(scriptSrc).toContain("'unsafe-eval'");
    expect(scriptSrc).toContain("'unsafe-inline'");
    expect(scriptSrc).toContain("'nonce-TESTNONCE'");
  });
});

describe("policy completeness", () => {
  it("keeps the hardening directives that used to live in next.config.ts", () => {
    for (const expected of [
      "default-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ]) {
      expect(production).toContain(expected);
    }
  });

  it("still allows the Supabase and LiveKit connections the app needs", () => {
    const connectSrc = directive(production, "connect-src");
    expect(connectSrc).toContain("https://*.supabase.co");
    expect(connectSrc).toContain("wss://*.livekit.cloud");
  });

  /**
   * Paddle renders its checkout in an iframe and is never posted to, so form-action has no
   * third party left to allow. Keeping a stale payment host here would leave a form target
   * open that nothing uses — which is exactly the kind of leftover an attacker looks for.
   */
  it("allows no third-party form target now that checkout is an iframe", () => {
    expect(directive(production, "form-action")).toBe("form-action 'self'");
    expect(directive(production, "frame-src")).toContain("https://*.paddle.com");
  });

  // Same invariant asserted from the urls side; kept here so either file failing points at
  // the mismatch.
  it("frame-src covers every allowlisted video embed host", () => {
    const frameSrc = directive(production, "frame-src");
    for (const host of VIDEO_EMBED_HOSTS) {
      expect(frameSrc).toContain(host);
    }
  });

  /**
   * SEC-18. Google sign-in supplies an avatar on the googleusercontent.com CDN, and the
   * tempting fix is one entry here. It was rejected: profile photos move across lh3–lh6, so
   * the entry that works for everyone is the whole Google user-content CDN on every page, to
   * render a 96px thumbnail. Provider avatars are imported into the avatars bucket instead
   * (src/server/auth/provider-avatar.ts), which keeps this directive first-party.
   */
  it("allows no third-party image host", () => {
    const imgSrc = directive(production, "img-src");
    expect(imgSrc).toBe("img-src 'self' data: blob: https://*.supabase.co");
    expect(imgSrc).not.toContain("googleusercontent");
  });

  it("no longer sets a static CSP in next.config.ts", () => {
    const config = readFileSync("next.config.ts", "utf8");
    expect(
      /key:\s*"Content-Security-Policy"/.test(config),
      "next.config.ts must not set CSP — a static header cannot carry a per-request nonce",
    ).toBe(false);
  });
});

describe("generateCspNonce", () => {
  it("produces a fresh, sufficiently long value each call", () => {
    const nonces = new Set(Array.from({ length: 50 }, () => generateCspNonce()));
    expect(nonces.size).toBe(50);
    for (const nonce of nonces) expect(nonce.length).toBeGreaterThanOrEqual(16);
  });
});
