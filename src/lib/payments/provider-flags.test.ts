import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  isPayPalLessonRailReleasable,
  payPalRailBlockedMessage,
  PAYPAL_LESSON_RAIL_OPEN_DEFECTS,
} from "./paypal-rail-readiness";

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

/**
 * The flag defaulting to off protects nothing against the person who turns it on.
 *
 * MON-01 and MON-04..06 are closed in the backlog as won't-fix-here — the Stripe rail
 * deletes these handlers — but they are unfixed money bugs in the code that is shipping
 * today. MON-01 alone lets a student who opens checkout twice be charged twice for one
 * lesson. Before this guard the only thing standing between that and production was one
 * environment variable.
 */
describe("the PayPal rail cannot be enabled while money bugs are open", () => {
  it("lists the defects that block it, with where they live", () => {
    expect(PAYPAL_LESSON_RAIL_OPEN_DEFECTS.length).toBeGreaterThan(0);
    for (const defect of PAYPAL_LESSON_RAIL_OPEN_DEFECTS) {
      expect(defect.id).toMatch(/^MON-\d+$/);
      expect(defect.consequence.length).toBeGreaterThan(40);
    }
  });

  it("names files that exist and still carry the defect", () => {
    // Ties the list to reality: deleting the marker without fixing, or moving the file,
    // fails here instead of quietly unblocking the rail.
    for (const defect of PAYPAL_LESSON_RAIL_OPEN_DEFECTS) {
      const source = readFileSync(defect.file, "utf8");
      expect(
        source.includes("KNOWN DEFECT"),
        `${defect.file} should still carry the KNOWN DEFECT marker for ${defect.id}`,
      ).toBe(true);
      expect(source).toContain(defect.id);
    }
  });

  it("reports the rail as not releasable while any defect is open", () => {
    expect(isPayPalLessonRailReleasable()).toBe(false);
  });

  it("explains itself to whoever set the flag", () => {
    const message = payPalRailBlockedMessage();
    expect(message).toContain("LESSON_PAYMENTS_PAYPAL_ENABLED");
    expect(message).toContain("MON-01");
    // It must say where to go, or the next step is deleting the gate.
    expect(message).toContain("src/lib/payments/paypal-rail-readiness.ts");
  });
});

/**
 * The behavioural half: with the flag ON and credentials present, the rail must still be
 * off. This is the assertion that actually prevents the double charge.
 */
describe("isLessonProviderEnabled with the flag turned on", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("stays off despite a true flag and valid credentials", async () => {
    vi.doMock("@/lib/env", () => ({
      env: {
        LESSON_PAYMENTS_PAYPAL_ENABLED: "true",
        PAYPAL_CLIENT_ID: "id",
        PAYPAL_CLIENT_SECRET: "secret",
      },
    }));

    const { isLessonProviderEnabled } = await import("./provider-flags");
    expect(isLessonProviderEnabled("paypal")).toBe(false);
  });

  it("would enable once nothing blocks it, so the gate is not a permanent off switch", async () => {
    vi.doMock("@/lib/env", () => ({
      env: {
        LESSON_PAYMENTS_PAYPAL_ENABLED: "true",
        PAYPAL_CLIENT_ID: "id",
        PAYPAL_CLIENT_SECRET: "secret",
      },
    }));
    vi.doMock("@/lib/payments/paypal-rail-readiness", () => ({
      isPayPalLessonRailReleasable: () => true,
      payPalRailBlockedMessage: () => "",
      PAYPAL_LESSON_RAIL_OPEN_DEFECTS: [],
    }));

    const { isLessonProviderEnabled } = await import("./provider-flags");
    expect(isLessonProviderEnabled("paypal")).toBe(true);
  });

  it("still requires credentials once unblocked", async () => {
    vi.doMock("@/lib/env", () => ({
      env: {
        LESSON_PAYMENTS_PAYPAL_ENABLED: "true",
        PAYPAL_CLIENT_ID: "",
        PAYPAL_CLIENT_SECRET: "",
      },
    }));
    vi.doMock("@/lib/payments/paypal-rail-readiness", () => ({
      isPayPalLessonRailReleasable: () => true,
      payPalRailBlockedMessage: () => "",
      PAYPAL_LESSON_RAIL_OPEN_DEFECTS: [],
    }));

    const { isLessonProviderEnabled } = await import("./provider-flags");
    expect(isLessonProviderEnabled("paypal")).toBe(false);
  });
});
