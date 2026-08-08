import { describe, expect, it } from "vitest";

import { currentLegalDocumentsForRole } from "@/lib/legal/documents";
import {
  amountsMatch,
  providerAmount,
  providerAmountToMinorUnits,
  routeLessonProviders,
} from "@/lib/payments/routing";
import { isBookingRefundPolicyEligible } from "@/lib/refunds/policy";
import { isAuthorizedBearer } from "@/lib/security/cron-auth";
import {
  checkRateLimit,
  resetMemoryRateLimits,
} from "@/lib/security/rate-limit";
import { createPayfastSignature } from "@/services/payfast/signature";
import { accountRestrictionReason } from "@/server/trust/enforcement";

describe("PayFast signatures", () => {
  it("encodes fields in insertion order and excludes an existing signature", () => {
    const fields = new Map([
      ["merchant_id", "10000100"],
      ["item_name", "Test Item"],
      ["signature", "ignored"],
    ]);
    expect(createPayfastSignature(fields, "secret")).toBe(
      "e5c585af062840165f9888f25d1bd7a7",
    );
  });
});

describe("payment amount conversion", () => {
  it("converts safely between cents and provider major units", () => {
    expect(providerAmount(12345, "USD")).toBe("123.45");
    expect(providerAmountToMinorUnits("12.345", "USD")).toBe(1235);
    expect(amountsMatch(1235, "12.35", "USD")).toBe(true);
  });

  it("does not route to an unlinked payment provider", () => {
    expect(routeLessonProviders({ currency: "USD", linkedProviders: [] })).toEqual([]);
  });
});

describe("legal document role selection", () => {
  it("requires the teacher agreement only for teachers", () => {
    expect(currentLegalDocumentsForRole("student")).toHaveLength(3);
    expect(currentLegalDocumentsForRole("teacher").map((item) => item.type)).toContain(
      "teacher_agreement",
    );
  });
});

describe("refund policy", () => {
  const now = new Date("2026-07-19T12:00:00.000Z");

  it("uses the 24-hour booking boundary", () => {
    expect(
      isBookingRefundPolicyEligible(new Date("2026-07-20T12:00:00.000Z"), now),
    ).toBe(true);
    expect(
      isBookingRefundPolicyEligible(new Date("2026-07-20T11:59:59.000Z"), now),
    ).toBe(false);
  });
});

describe("cron authorization", () => {
  it("requires an exact Bearer secret", () => {
    expect(isAuthorizedBearer("Bearer correct", "correct")).toBe(true);
    expect(isAuthorizedBearer("Bearer wrong", "correct")).toBe(false);
    expect(isAuthorizedBearer(null, "correct")).toBe(false);
    expect(isAuthorizedBearer("Bearer correct", undefined)).toBe(false);
  });
});

describe("in-memory rate limiting", () => {
  it("rejects requests beyond the deterministic limit", async () => {
    resetMemoryRateLimits();
    const options = { key: "test:limit", limit: 2, windowMs: 60_000 };
    expect((await checkRateLimit(options)).success).toBe(true);
    expect((await checkRateLimit(options)).remaining).toBe(0);
    const denied = await checkRateLimit(options);
    expect(denied.success).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe("trust enforcement", () => {
  it("blocks removed and suspended accounts with safe reasons", () => {
    expect(accountRestrictionReason(null)).toBe("This account has been removed.");
    expect(
      accountRestrictionReason({
        deletedAt: null,
        accountStatus: "suspended",
        accountStatusReason: "Safety review",
      }),
    ).toBe("Safety review");
    expect(
      accountRestrictionReason({
        deletedAt: null,
        accountStatus: "active",
        accountStatusReason: null,
      }),
    ).toBeNull();
  });
});
