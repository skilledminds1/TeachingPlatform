import { describe, expect, it } from "vitest";

import {
  platformAnalyticsCsv,
  summarizePlatformAnalytics,
  type PlatformAnalyticsFixture,
} from "./platform-analytics";

const NOW = new Date("2026-07-19T12:00:00.000Z");

function fixture(
  overrides: Partial<PlatformAnalyticsFixture> = {},
): PlatformAnalyticsFixture {
  return {
    payments: [],
    refundRequests: [],
    disputes: [],
    learnerActivity: [],
    organizations: [],
    subscriptionInvoices: [],
    ...overrides,
  };
}

function payment(
  overrides: Partial<PlatformAnalyticsFixture["payments"][number]> = {},
): PlatformAnalyticsFixture["payments"][number] {
  return {
    id: "payment-1",
    status: "succeeded",
    amountCents: 10_000,
    refundedCents: 0,
    currency: "USD",
    createdAt: new Date("2026-07-10T12:00:00.000Z"),
    succeededAt: new Date("2026-07-10T12:01:00.000Z"),
    studentEmail: "student@example.com",
    teacherEmail: "teacher@example.com",
    organizationSlug: "real-school",
    ...overrides,
  };
}

describe("summarizePlatformAnalytics", () => {
  it("calculates GMV, net volume, and refund rate from verified payments", () => {
    const data = summarizePlatformAnalytics(
      fixture({
        payments: [
          payment({ id: "one", amountCents: 10_000, refundedCents: 2_500 }),
          payment({ id: "two", amountCents: 5_000 }),
          payment({ id: "failed", status: "failed", amountCents: 50_000 }),
        ],
      }),
      "30d",
      NOW,
    );

    expect(data.teacherVolume.byCurrency).toEqual([
      expect.objectContaining({
        currency: "USD",
        grossCents: 15_000,
        refundedCents: 2_500,
        netCents: 12_500,
        count: 2,
      }),
    ]);
    expect(data.refunds.refundRate).toBe(16.7);
  });

  it("uses all checkout attempts as conversion denominators", () => {
    const data = summarizePlatformAnalytics(
      fixture({
        payments: [
          // Refunded counts as succeeded: checkout itself completed before the refund.
          payment({ id: "refunded", status: "refunded" }),
          payment({ id: "pending", status: "pending" }),
          payment({ id: "failed", status: "failed" }),
        ],
      }),
      "30d",
      NOW,
    );

    expect(data.conversion.lesson).toEqual({ starts: 3, succeeded: 1, rate: 33.3 });
  });

  it("excludes demo users and demo organizations from every tested metric", () => {
    const data = summarizePlatformAnalytics(
      fixture({
        payments: [
          payment(),
          payment({
            id: "demo-student",
            studentEmail: "student@demo.teachingplatform.local",
          }),
          payment({
            id: "demo-teacher",
            teacherEmail: "teacher@teachingplatform.local",
          }),
          payment({ id: "demo-org", organizationSlug: "demo-school" }),
        ],
        learnerActivity: [
          {
            studentId: "real",
            occurredAt: new Date("2026-07-10T12:00:00.000Z"),
            studentEmail: "student@example.com",
            teacherEmail: "teacher@example.com",
            organizationSlug: "real-school",
          },
          {
            studentId: "demo",
            occurredAt: new Date("2026-07-10T12:00:00.000Z"),
            studentEmail: "student@demo.teachingplatform.local",
            teacherEmail: "teacher@example.com",
            organizationSlug: "real-school",
          },
        ],
      }),
      "30d",
      NOW,
    );

    expect(data.teacherVolume.successfulTransactions).toBe(1);
    expect(data.conversion.lesson.starts).toBe(1);
    expect(data.learners.active).toBe(1);
  });

  it("keeps currencies in distinct buckets", () => {
    const data = summarizePlatformAnalytics(
      fixture({
        payments: [
          payment({ id: "usd", amountCents: 10_000, currency: "USD" }),
          payment({ id: "zar", amountCents: 20_000, currency: "ZAR" }),
        ],
        organizations: [
          {
            id: "usd-org",
            slug: "usd-org",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            subscriptionStatus: "active",
            cancelAtPeriodEnd: false,
            complimentaryPlanId: null,
            billingInterval: "monthly",
            planSlug: "starter",
            monthlyPriceCents: 1_000,
            annualPriceCents: 10_000,
            currency: "USD",
          },
          {
            id: "zar-org",
            slug: "zar-org",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            subscriptionStatus: "active",
            cancelAtPeriodEnd: false,
            complimentaryPlanId: null,
            billingInterval: "annual",
            planSlug: "business",
            monthlyPriceCents: 30_000,
            annualPriceCents: 300_000,
            currency: "ZAR",
          },
        ],
      }),
      "30d",
      NOW,
    );

    expect(data.teacherVolume.byCurrency.map(({ currency, netCents }) => ({
      currency,
      netCents,
    }))).toEqual([
      { currency: "USD", netCents: 10_000 },
      { currency: "ZAR", netCents: 20_000 },
    ]);
    expect(data.subscriptions.mrrByCurrency.map(({ currency, amountCents }) => ({
      currency,
      amountCents,
    }))).toEqual([
      { currency: "USD", amountCents: 1_000 },
      { currency: "ZAR", amountCents: 25_000 },
    ]);
  });
});

describe("platformAnalyticsCsv", () => {
  it("emits the header and a uniform column count on every row", () => {
    const csv = platformAnalyticsCsv(
      summarizePlatformAnalytics(
        fixture({ payments: [payment({ amountCents: 10_000, refundedCents: 2_500 })] }),
        "30d",
        NOW,
      ),
    );
    const lines = csv.trimEnd().split("\r\n");

    expect(lines[0]).toBe(
      "section,metric,currency,gross_cents,refunded_cents,net_or_value,denominator,rate_percent",
    );
    expect(lines.every((line) => line.split(",").length === 8)).toBe(true);
    expect(lines).toContain("teacher_processed_volume,lesson,USD,10000,2500,7500,1,");
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});
