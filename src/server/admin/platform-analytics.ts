import {
  analyticsRangeLabel,
  type AnalyticsRange,
} from "@/features/teacher-dashboard/lib/analytics-range";
import { db } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import {
  analyticsWindowInZone,
  bucketKeyInZone,
  bucketKeysInZone,
  bucketLabelInZone,
} from "@/server/analytics/buckets";
import { requirePlatformAdmin } from "@/server/auth/session";

export type { AnalyticsRange } from "@/features/teacher-dashboard/lib/analytics-range";
export {
  ANALYTICS_RANGES,
  analyticsRangeLabel,
  parseAnalyticsRange,
} from "@/features/teacher-dashboard/lib/analytics-range";

const SUCCESS_STATUSES = new Set(["succeeded", "refunded", "partially_refunded"]);
const UNRESOLVED_REFUND_STATUSES = new Set(["requested", "teacher_approved", "escalated"]);
const OPEN_DISPUTE_STATUSES = new Set(["open", "under_review"]);

type Subject = {
  studentEmail: string;
  teacherEmail: string;
  organizationSlug: string;
};

export type PlatformAnalyticsFixture = {
  payments: Array<Subject & {
    id: string;
    status: string;
    amountCents: number;
    refundedCents: number;
    currency: string;
    createdAt: Date;
    succeededAt: Date | null;
  }>;
  refundRequests: Array<Subject & {
    id: string;
    status: string;
    requestedAmountCents: number;
    providerRefundedCents: number;
    currency: string;
    requestedAt: Date;
  }>;
  disputes: Array<Subject & {
    id: string;
    status: string;
    amountCents: number;
    currency: string;
    openedAt: Date;
  }>;
  learnerActivity: Array<Subject & {
    studentId: string;
    occurredAt: Date;
  }>;
  organizations: Array<{
    id: string;
    slug: string;
    createdAt: Date;
    subscriptionStatus: string;
    cancelAtPeriodEnd: boolean;
    complimentaryPlanId: string | null;
    billingInterval: "monthly" | "annual";
    planSlug: string;
    monthlyPriceCents: number;
    annualPriceCents: number;
    currency: string;
  }>;
  subscriptionInvoices: Array<{
    id: string;
    organizationId: string;
    organizationSlug: string;
    status: string;
    amountCents: number;
    currency: string;
    issuedAt: Date;
  }>;
};

type MoneyBucket = {
  currency: string;
  grossCents: number;
  refundedCents: number;
  netCents: number;
  count: number;
};

type TrendPoint = {
  key: string;
  label: string;
  teacherGrossCentsByCurrency: Record<string, number>;
  teacherNetCentsByCurrency: Record<string, number>;
  platformRevenueCentsByCurrency: Record<string, number>;
  lessonCheckoutStarts: number;
  lessonCheckoutSucceeded: number;
};

/**
 * INT-14: the window and the bucket keys were computed in UTC here and, separately, in
 * src/server/teachers/analytics.ts. Both are now the shared zone-aware helpers, so an
 * admin's "today" is their own calendar day rather than Greenwich's.
 *
 * `timeZone` defaults to UTC so a caller that genuinely wants UTC reporting — and the
 * fixture tests, which are written in UTC — keep their existing behaviour.
 */
export function platformAnalyticsWindow(
  range: AnalyticsRange,
  now = new Date(),
  timeZone = "UTC",
) {
  return analyticsWindowInZone(range, timeZone, now);
}

function inWindow(date: Date, start: Date | null, end: Date): boolean {
  return (!start || date >= start) && date <= end;
}

function isDemo(subject: { studentEmail?: string; teacherEmail?: string; organizationSlug?: string }) {
  return (
    subject.studentEmail?.toLowerCase().endsWith("teachingplatform.local") === true ||
    subject.teacherEmail?.toLowerCase().endsWith("teachingplatform.local") === true ||
    subject.organizationSlug?.toLowerCase().startsWith("demo-") === true
  );
}

function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

function moneyBucket(currency: string): MoneyBucket {
  return { currency, grossCents: 0, refundedCents: 0, netCents: 0, count: 0 };
}

function addMoney(
  buckets: Map<string, MoneyBucket>,
  currency: string,
  grossCents: number,
  refundedCents: number,
) {
  const bucket = buckets.get(currency) ?? moneyBucket(currency);
  bucket.grossCents += grossCents;
  bucket.refundedCents += refundedCents;
  bucket.netCents += grossCents - refundedCents;
  bucket.count += 1;
  buckets.set(currency, bucket);
}

function moneyRows(buckets: Map<string, MoneyBucket>) {
  return [...buckets.values()]
    .sort((a, b) => a.currency.localeCompare(b.currency))
    .map((bucket) => ({
      ...bucket,
      grossLabel: formatCurrency(bucket.grossCents, bucket.currency),
      refundedLabel: formatCurrency(bucket.refundedCents, bucket.currency),
      netLabel: formatCurrency(bucket.netCents, bucket.currency),
    }));
}

function amountRows(buckets: Map<string, number>) {
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amountCents]) => ({
      currency,
      amountCents,
      amountLabel: formatCurrency(amountCents, currency),
    }));
}

function trendScaffold(
  range: AnalyticsRange,
  start: Date | null,
  end: Date,
  timeZone: string,
): TrendPoint[] {
  return bucketKeysInZone(range, start, end, timeZone).map((key) => ({
    key,
    label: bucketLabelInZone(key),
    teacherGrossCentsByCurrency: {},
    teacherNetCentsByCurrency: {},
    platformRevenueCentsByCurrency: {},
    lessonCheckoutStarts: 0,
    lessonCheckoutSucceeded: 0,
  }));
}

export function summarizePlatformAnalytics(
  fixture: PlatformAnalyticsFixture,
  range: AnalyticsRange = "30d",
  now = new Date(),
  // INT-14: the admin's own calendar. Defaults to UTC so existing callers and the fixture
  // tests, which are written in UTC, keep the behaviour they were built against.
  timeZone = "UTC",
) {
  const { start, end, previousStart, previousEnd, days } = platformAnalyticsWindow(
    range,
    now,
    timeZone,
  );
  const trend = trendScaffold(range, start, end, timeZone);
  const trendByKey = new Map(trend.map((point) => [point.key, point]));
  const trendRange = range === "all" ? "365d" : range;

  const payments = fixture.payments.filter(
    (payment) => !isDemo(payment) && inWindow(payment.createdAt, start, end),
  );
  const successfulPayments = payments.filter((payment) => SUCCESS_STATUSES.has(payment.status));
  const volume = new Map<string, MoneyBucket>();

  for (const payment of successfulPayments) {
    addMoney(volume, payment.currency, payment.amountCents, payment.refundedCents);
  }

  for (const payment of payments) {
    const point = trendByKey.get(bucketKeyInZone(payment.createdAt, trendRange, timeZone));
    if (!point) continue;
    point.lessonCheckoutStarts += 1;
    if (SUCCESS_STATUSES.has(payment.status)) {
      point.lessonCheckoutSucceeded += 1;
      point.teacherGrossCentsByCurrency[payment.currency] =
        (point.teacherGrossCentsByCurrency[payment.currency] ?? 0) + payment.amountCents;
      point.teacherNetCentsByCurrency[payment.currency] =
        (point.teacherNetCentsByCurrency[payment.currency] ?? 0) +
        payment.amountCents -
        payment.refundedCents;
    }
  }

  const refundRequests = fixture.refundRequests.filter(
    (request) => !isDemo(request) && inWindow(request.requestedAt, start, end),
  );
  const requestedByCurrency = new Map<string, number>();
  for (const request of refundRequests) {
    requestedByCurrency.set(
      request.currency,
      (requestedByCurrency.get(request.currency) ?? 0) + request.requestedAmountCents,
    );
  }
  const unresolvedRequests = refundRequests.filter((request) =>
    UNRESOLVED_REFUND_STATUSES.has(request.status),
  );
  const disputes = fixture.disputes.filter(
    (dispute) => !isDemo(dispute) && inWindow(dispute.openedAt, start, end),
  );
  const disputedByCurrency = new Map<string, number>();
  for (const dispute of disputes) {
    disputedByCurrency.set(
      dispute.currency,
      (disputedByCurrency.get(dispute.currency) ?? 0) + dispute.amountCents,
    );
  }

  const currentLearners = new Set(
    fixture.learnerActivity
      .filter((activity) => !isDemo(activity) && inWindow(activity.occurredAt, start, end))
      .map((activity) => activity.studentId),
  );
  const previousLearners =
    previousStart && previousEnd
      ? new Set(
          fixture.learnerActivity
            .filter(
              (activity) =>
                !isDemo(activity) &&
                inWindow(activity.occurredAt, previousStart, previousEnd),
            )
            .map((activity) => activity.studentId),
        )
      : new Set<string>();
  const retainedLearners = [...previousLearners].filter((id) => currentLearners.has(id)).length;

  const organizations = fixture.organizations.filter(
    (organization) => !isDemo({ organizationSlug: organization.slug }),
  );
  const paidOrganizations = organizations.filter(
    (organization) =>
      organization.planSlug !== "free" &&
      !organization.complimentaryPlanId &&
      organization.subscriptionStatus === "active",
  );
  const mrr = new Map<string, number>();
  for (const organization of paidOrganizations) {
    const amount =
      organization.billingInterval === "annual"
        ? Math.round(organization.annualPriceCents / 12)
        : organization.monthlyPriceCents;
    mrr.set(organization.currency, (mrr.get(organization.currency) ?? 0) + amount);
  }

  const invoices = fixture.subscriptionInvoices.filter(
    (invoice) =>
      !isDemo({ organizationSlug: invoice.organizationSlug }) &&
      inWindow(invoice.issuedAt, start, end),
  );
  const platformRevenue = new Map<string, MoneyBucket>();
  for (const invoice of invoices) {
    if (invoice.status === "void") continue;
    addMoney(
      platformRevenue,
      invoice.currency,
      invoice.amountCents,
      invoice.status === "refunded" ? invoice.amountCents : 0,
    );
    const point = trendByKey.get(bucketKeyInZone(invoice.issuedAt, trendRange, timeZone));
    if (point) {
      point.platformRevenueCentsByCurrency[invoice.currency] =
        (point.platformRevenueCentsByCurrency[invoice.currency] ?? 0) +
        (invoice.status === "refunded" ? 0 : invoice.amountCents);
    }
  }

  const currentPayingIds = new Set(
    invoices.filter((invoice) => invoice.status === "paid").map((invoice) => invoice.organizationId),
  );
  let subscriptionDenominator: Set<string>;
  if (previousStart && previousEnd) {
    subscriptionDenominator = new Set(
      fixture.subscriptionInvoices
        .filter(
          (invoice) =>
            !isDemo({ organizationSlug: invoice.organizationSlug }) &&
            invoice.status === "paid" &&
            inWindow(invoice.issuedAt, previousStart, previousEnd),
        )
        .map((invoice) => invoice.organizationId),
    );
  } else {
    subscriptionDenominator = new Set(
      fixture.subscriptionInvoices
        .filter(
          (invoice) =>
            !isDemo({ organizationSlug: invoice.organizationSlug }) &&
            invoice.status === "paid" &&
            invoice.issuedAt <= end,
        )
        .map((invoice) => invoice.organizationId),
    );
  }
  const retainedSubscriptions =
    range === "all"
      ? paidOrganizations.filter((organization) => subscriptionDenominator.has(organization.id))
          .length
      : [...subscriptionDenominator].filter((id) => currentPayingIds.has(id)).length;
  const churnedSubscriptions = Math.max(
    0,
    subscriptionDenominator.size - retainedSubscriptions,
  );

  const lessonStarts = payments.length;
  const lessonSucceeded = successfulPayments.length;
  const volumeRows = moneyRows(volume);
  const primaryTeacherCurrency =
    [...volumeRows].sort((a, b) => b.netCents - a.netCents)[0]?.currency ?? "USD";
  const platformRevenueRows = moneyRows(platformRevenue);
  const primaryPlatformCurrency =
    [...platformRevenueRows].sort((a, b) => b.netCents - a.netCents)[0]?.currency ??
    amountRows(mrr)[0]?.currency ??
    "USD";

  return {
    range,
    rangeLabel: analyticsRangeLabel(range),
    generatedAt: end,
    days,
    primaryTeacherCurrency,
    primaryPlatformCurrency,
    teacherVolume: {
      byCurrency: volumeRows,
      successfulTransactions: successfulPayments.length,
      note:
        "Teacher-processed transaction volume is not Amazing Skills revenue. Gross is verified successful payment value; net subtracts recorded provider refunds. Currencies are never combined.",
    },
    refunds: {
      reportedByCurrency: amountRows(requestedByCurrency),
      refundedByCurrency: volumeRows.map((row) => ({
        currency: row.currency,
        amountCents: row.refundedCents,
        amountLabel: row.refundedLabel,
      })),
      requestCount: refundRequests.length,
      unresolvedCount: unresolvedRequests.length,
      disputeCount: disputes.length,
      openDisputeCount: disputes.filter((dispute) => OPEN_DISPUTE_STATUSES.has(dispute.status))
        .length,
      disputedByCurrency: amountRows(disputedByCurrency),
      refundRate: percent(
        volumeRows.reduce((sum, row) => sum + row.refundedCents, 0),
        volumeRows.reduce((sum, row) => sum + row.grossCents, 0),
      ),
      refundRateNote:
        "Refund rate denominator is gross verified teacher-processed volume in the selected window. The aggregate percentage is shown only as an operational ratio; currency amounts remain separate.",
    },
    conversion: {
      lesson: {
        starts: lessonStarts,
        succeeded: lessonSucceeded,
        rate: percent(lessonSucceeded, lessonStarts),
      },
      note:
        "Checkout starts are payment attempts created in the selected window. Succeeded includes succeeded, refunded, and partially refunded attempts because checkout originally completed.",
    },
    learners: {
      active: currentLearners.size,
      previousActive: previousLearners.size,
      retained: retainedLearners,
      retentionRate: percent(retainedLearners, previousLearners.size),
      retentionNote:
        "Active learner retention denominator is unique non-demo learners with a confirmed or completed lesson in the immediately preceding equal-length window.",
    },
    subscriptions: {
      activePaidOrganizations: paidOrganizations.length,
      scheduledToCancel: paidOrganizations.filter((organization) => organization.cancelAtPeriodEnd)
        .length,
      cohortSize: subscriptionDenominator.size,
      retained: retainedSubscriptions,
      churned: churnedSubscriptions,
      retentionRate: percent(retainedSubscriptions, subscriptionDenominator.size),
      churnRate: percent(churnedSubscriptions, subscriptionDenominator.size),
      mrrByCurrency: amountRows(mrr),
      revenueByCurrency: platformRevenueRows,
      note:
        range === "all"
          ? "All-time subscription retention denominator is organizations that have ever paid; retained means currently on a non-complimentary paid plan. MRR normalizes annual list price to one month."
          : "Subscription retention denominator is organizations with a paid invoice in the immediately preceding equal-length window; retained means another paid invoice in this window. MRR is current platform subscription list revenue only and normalizes annual price to one month.",
    },
    trend: trend.map((point) => ({
      ...point,
      teacherNetCents: point.teacherNetCentsByCurrency[primaryTeacherCurrency] ?? 0,
      platformRevenueCents:
        point.platformRevenueCentsByCurrency[primaryPlatformCurrency] ?? 0,
    })),
  };
}

export async function getPlatformAnalytics(
  range: AnalyticsRange = "30d",
  now = new Date(),
) {
  // INT-14: report on the admin's own calendar, not Greenwich's. Their day boundary decides
  // which bucket a payment made late in the evening lands in.
  const admin = await requirePlatformAdmin();
  const timeZone = admin.timezone;
  const { start, previousStart } = platformAnalyticsWindow(range, now, timeZone);
  const earliest = previousStart ?? start;

  const [
    paymentRows,
    refundRows,
    disputeRows,
    bookingRows,
    organizations,
    invoiceRows,
  ] = await Promise.all([
    db.paymentAttempt.findMany({
      where: earliest ? { createdAt: { gte: earliest, lte: now } } : { createdAt: { lte: now } },
      select: {
        id: true,
        status: true,
        amountCents: true,
        refundedCents: true,
        currency: true,
        createdAt: true,
        succeededAt: true,
        booking: {
          select: {
            student: { select: { email: true } },
            teacher: { select: { email: true } },
            organization: { select: { slug: true } },
          },
        },
      },
    }),
    db.refundRequest.findMany({
      where: earliest
        ? { requestedAt: { gte: earliest, lte: now } }
        : { requestedAt: { lte: now } },
      select: {
        id: true,
        status: true,
        requestedAmountCents: true,
        providerRefundedCents: true,
        currency: true,
        requestedAt: true,
        student: { select: { email: true } },
        teacher: { select: { email: true } },
        booking: { select: { organization: { select: { slug: true } } } },
      },
    }),
    db.paymentDispute.findMany({
      where: earliest ? { openedAt: { gte: earliest, lte: now } } : { openedAt: { lte: now } },
      select: {
        id: true,
        status: true,
        amountCents: true,
        currency: true,
        openedAt: true,
        paymentAttempt: {
          select: {
            amountCents: true,
            currency: true,
            booking: {
              select: {
                student: { select: { email: true } },
                teacher: { select: { email: true } },
                organization: { select: { slug: true } },
              },
            },
          },
        },
      },
    }),
    db.booking.findMany({
      where: {
        status: { in: ["confirmed", "completed"] },
        ...(earliest ? { startsAt: { gte: earliest, lte: now } } : { startsAt: { lte: now } }),
      },
      select: {
        studentId: true,
        startsAt: true,
        student: { select: { email: true } },
        teacher: { select: { email: true } },
        organization: { select: { slug: true } },
      },
    }),
    db.organization.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        slug: true,
        createdAt: true,
        subscriptionStatus: true,
        cancelAtPeriodEnd: true,
        complimentaryPlanId: true,
        billingInterval: true,
        plan: {
          select: {
            slug: true,
            monthlyPriceCents: true,
            annualPriceCents: true,
            currency: true,
          },
        },
      },
    }),
    db.subscriptionInvoice.findMany({
      where: earliest ? { issuedAt: { gte: earliest, lte: now } } : { issuedAt: { lte: now } },
      select: {
        id: true,
        organizationId: true,
        status: true,
        amountCents: true,
        currency: true,
        issuedAt: true,
        organization: { select: { slug: true } },
      },
    }),
  ]);

  const fixture: PlatformAnalyticsFixture = {
    // A payment attempt whose booking has been deleted has no subject to attribute it to,
    // so it cannot be demo-filtered and is dropped rather than counted blind.
    payments: paymentRows.flatMap((payment) => {
      const booking = payment.booking;
      if (!booking) return [];
      return [{
        id: payment.id,
        status: payment.status,
        amountCents: payment.amountCents,
        refundedCents: payment.refundedCents,
        currency: payment.currency,
        createdAt: payment.createdAt,
        succeededAt: payment.succeededAt,
        studentEmail: booking.student.email,
        teacherEmail: booking.teacher.email,
        organizationSlug: booking.organization.slug,
      }];
    }),
    refundRequests: refundRows.map((request) => ({
      id: request.id,
      status: request.status,
      requestedAmountCents: request.requestedAmountCents,
      providerRefundedCents: request.providerRefundedCents,
      currency: request.currency,
      requestedAt: request.requestedAt,
      studentEmail: request.student.email,
      teacherEmail: request.teacher.email,
      organizationSlug: request.booking?.organization.slug ?? "",
    })),
    disputes: disputeRows.flatMap((dispute) => {
      const booking = dispute.paymentAttempt.booking;
      if (!booking) return [];
      return [{
        id: dispute.id,
        status: dispute.status,
        amountCents: dispute.amountCents ?? dispute.paymentAttempt.amountCents,
        currency: dispute.currency ?? dispute.paymentAttempt.currency,
        openedAt: dispute.openedAt,
        studentEmail: booking.student.email,
        teacherEmail: booking.teacher.email,
        organizationSlug: booking.organization.slug,
      }];
    }),
    learnerActivity: bookingRows.map((booking) => ({
      studentId: booking.studentId,
      occurredAt: booking.startsAt,
      studentEmail: booking.student.email,
      teacherEmail: booking.teacher.email,
      organizationSlug: booking.organization.slug,
    })),
    organizations: organizations.map((organization) => ({
      id: organization.id,
      slug: organization.slug,
      createdAt: organization.createdAt,
      subscriptionStatus: organization.subscriptionStatus,
      cancelAtPeriodEnd: organization.cancelAtPeriodEnd,
      complimentaryPlanId: organization.complimentaryPlanId,
      billingInterval: organization.billingInterval,
      planSlug: organization.plan.slug,
      monthlyPriceCents: organization.plan.monthlyPriceCents,
      annualPriceCents: organization.plan.annualPriceCents,
      currency: organization.plan.currency,
    })),
    subscriptionInvoices: invoiceRows.map((invoice) => ({
      id: invoice.id,
      organizationId: invoice.organizationId,
      organizationSlug: invoice.organization.slug,
      status: invoice.status,
      amountCents: invoice.amountCents,
      currency: invoice.currency,
      issuedAt: invoice.issuedAt,
    })),
  };

  return summarizePlatformAnalytics(fixture, range, now, timeZone);
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function platformAnalyticsCsv(
  data: ReturnType<typeof summarizePlatformAnalytics>,
): string {
  const rows: Array<Array<string | number>> = [
    ["section", "metric", "currency", "gross_cents", "refunded_cents", "net_or_value", "denominator", "rate_percent"],
  ];
  for (const row of data.teacherVolume.byCurrency) {
    rows.push(["teacher_processed_volume", "lesson", row.currency, row.grossCents, row.refundedCents, row.netCents, row.count, ""]);
  }
  for (const row of data.refunds.reportedByCurrency) {
    rows.push(["refunds", "reported_amount", row.currency, "", "", row.amountCents, data.teacherVolume.successfulTransactions, data.refunds.refundRate]);
  }
  rows.push(["conversion", "lesson_checkout", "", "", "", data.conversion.lesson.succeeded, data.conversion.lesson.starts, data.conversion.lesson.rate]);
  rows.push(["learners", "active_retention", "", "", "", data.learners.retained, data.learners.previousActive, data.learners.retentionRate]);
  for (const row of data.subscriptions.mrrByCurrency) {
    rows.push(["platform_subscription_revenue", "mrr", row.currency, "", "", row.amountCents, data.subscriptions.activePaidOrganizations, ""]);
  }
  for (const row of data.subscriptions.revenueByCurrency) {
    rows.push(["platform_subscription_revenue", "invoice_revenue", row.currency, row.grossCents, row.refundedCents, row.netCents, row.count, ""]);
  }
  rows.push(["subscriptions", "retention", "", "", "", data.subscriptions.retained, data.subscriptions.cohortSize, data.subscriptions.retentionRate]);
  rows.push(["subscriptions", "churn", "", "", "", data.subscriptions.churned, data.subscriptions.cohortSize, data.subscriptions.churnRate]);
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
