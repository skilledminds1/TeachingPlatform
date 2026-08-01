import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * SEC-02 regression guard.
 *
 * The PayPal partner-referral linking callback has no CSRF state check: it writes
 * providerAccountId from attacker-controllable query params, so a crafted link repoints a
 * teacher's payout destination. Rather than harden a flow being replaced by the Stripe rail
 * (and which is functionally broken anyway — it stores PayPal's tracking id where the
 * merchant id belongs), both entry points are gated behind the PayPal feature flag, which
 * defaults to off.
 *
 * These tests fail if that gate is removed, so the hole cannot silently reopen.
 */

const CALLBACK_ROUTE = "src/app/api/v1/payments/paypal/callback/route.ts";
const LINKING_ACTION = "src/actions/payment-linking.ts";

describe("PayPal linking is gated behind the feature flag", () => {
  it("the callback route refuses requests when the flag is off", () => {
    const source = readFileSync(CALLBACK_ROUTE, "utf8");
    expect(
      source.includes('isLessonProviderEnabled("paypal")'),
      `${CALLBACK_ROUTE} must check isLessonProviderEnabled before touching query params`,
    ).toBe(true);

    // The gate has to precede the partner-referral branch, or it protects nothing.
    const gateIndex = source.indexOf('isLessonProviderEnabled("paypal")');
    const branchIndex = source.indexOf("trackingId || merchantId");
    expect(gateIndex).toBeGreaterThan(-1);
    expect(branchIndex).toBeGreaterThan(-1);
    expect(
      gateIndex < branchIndex,
      "the feature-flag gate must come before the partner-referral branch",
    ).toBe(true);
  });

  it("startPayPalConnect refuses to create an account when the flag is off", () => {
    const source = readFileSync(LINKING_ACTION, "utf8");
    expect(source).toContain('isLessonProviderEnabled("paypal")');
  });

  it("the flag defaults to off", () => {
    const source = readFileSync("src/lib/env.ts", "utf8");
    expect(source).toMatch(
      /LESSON_PAYMENTS_PAYPAL_ENABLED:\s*z\s*\.enum\(\["true",\s*"false"\]\)\s*\.default\("false"\)/,
    );
  });
});
