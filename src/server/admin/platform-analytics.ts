import {
  analyticsRangeLabel,
  type AnalyticsRange,
} from "@/features/teacher-dashboard/lib/analytics-range";
import { db } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
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
    kind: "lesson" | "course";
    status: string;
    amountCents: number;
    refundedCents: number;
    currency: string;
    createdAt: Date;
    succeededAt: Date | null;
  }>;
  refundRequests: Array<Subject & {
    id: string;
    kind: "lesson" | "course";
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
  courseEnrollments: Array<Subject & {
    id: string;
    studentId: string;
    enrolledAt: Date;
    revokedAt: Date | null;
    lessonCount: number;
    completedLessonCount: number;
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
  courseCheckoutStarts: number;
  courseCheckoutSucceeded: number;
};

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function platformAnalyticsWindow(range: AnalyticsRange, now = new Date()) {
  if (range === "all") {
    return {
      start: null as Date | null,
      end: now,
      previousStart: null as Date | null,
      previousEnd: null as Date | null,
      days: null as number | null,
    };
  }
  const days = range === "30d" ? 30 : range === "90d" ? 90 : 365;
  const start = addUtcDays(startOfUtcDay(now), -(days - 1));
  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = addUtcDays(startOfUtcDay(previousEnd), -(days - 1));
  return { start, end: now, previousStart, previousEnd, days };
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

function bucketKey(date: Date, range: AnalyticsRange): string {
  if (range === "365d" || range === "all") {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return date.toISOString().slice(0, 10);
}

function bucketLabel(key: string, range: AnalyticsRange): string {
  if (range === "365d" || range === "all") {
    const [year, month] = key.split("-").map(Number);
    return new Intl.DateTimeFormat("en-ZA", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(year, month - 1, 1)));
  }
  return formatDate(new Date(`${key}T00:00:00.000Z`));
}

function trendScaffold(range: AnalyticsRange, start: Date | null, end: Date): TrendPoint[] {
  const points: TrendPoint[] = [];
  const makePoint = (key: string): TrendPoint => ({
    key,
    label: bucketLabel(key, range === "all" ? "365d" : range),
    teacherGrossCentsByCurrency: {},
    teacherNetCentsByCurrency: {},
    platformRevenueCentsByCurrency: {},
    lessonCheckoutStarts: 0,
    lessonCheckoutSucceeded: 0,
    courseCheckoutStarts: 0,
    courseCheckoutSucceeded: 0,
  });

  if (!start) {
    const cursor = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1));
    while (cursor <= end) {
      points.push(makePoint(bucketKey(cursor, "365d")));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  } else if (range === "365d") {
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    while (cursor <= end) {
      points.push(makePoint(bucketKey(cursor, range)));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  } else {
    const cursor = startOfUtcDay(start);
    while (cursor <= startOfUtcDay(end)) {
      points.push(makePoint(bucketKey(cursor, range)));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  return points;
}

export function summarizePlatformAnalytics(
  fixture: PlatformAnalyticsFixture,
  range: AnalyticsRange = "30d",
  now = new Date(),
) {
  const { start, end, previousStart, previousEnd, days } = platformAnalyticsWindow(range, now);
  const trend = trendScaffold(range, start, end);
  const trendByKey = new Map(trend.map((point) => [point.key, point]));
  const trendRange = range === "all" ? "365d" : range;

  const payments = fixture.payments.filter(
    (payment) => !isDemo(payment) && inWindow(payment.createdAt, start, end),
  );
  const successfulPayments = payments.filter((payment) => SUCCESS_STATUSES.has(payment.status));
  const volume = new Map<string, MoneyBucket>();
  const lessonVolume = new Map<string, MoneyBucket>();
  const courseVolume = new Map<string, MoneyBucket>();

  for (const payment of successfulPayments) {
    addMoney(volume, payment.currency, payment.amountCents, payment.refundedCents);
    addMoney(
      payment.kind === "lesson" ? lessonVolume : courseVolume,
      payment.currency,
      payment.amountCents,
      payment.refundedCents,
    );
  }

  for (const payment of payments) {
    const point = trendByKey.get(bucketKey(payment.createdAt, trendRange));
    if (!point) continue;
    if (payment.kind === "lesson") {
      point.lessonCheckoutStarts += 1;
      if (SUCCESS_STATUSES.has(payment.status)) point.lessonCheckoutSucceeded += 1;
    } else {
      point.courseCheckoutStarts += 1;
      if (SUCCESS_STATUSES.has(payment.status)) point.courseCheckoutSucceeded += 1;
    }
    if (SUCCESS_STATUSES.has(payment.status)) {
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

  const eligibleEnrollments = fixture.courseEnrollments.filter(
    (enrollment) =>
      !isDemo(enrollment) &&
      !enrollment.revokedAt &&
      enrollment.lessonCount > 0 &&
      inWindow(enrollment.enrolledAt, start, end),
  );
  const completedEnrollments = eligibleEnrollments.filter(
    (enrollment) => enrollment.completedLessonCount >= enrollment.lessonCount,
  ).length;

  const organizations = fixture.organizations.filter(
    (organization) => !isDemo({ organizationSlug: organization.slug }),
  );
  const paidOrganizations = organizations.filter(
    (organization) =>
      organization.planSlug !== "free" &&
      !organization.complimentaryPlanId &&
      (organization.subscriptionStatus === "active" ||
        organization.subscriptionStatus === "trialing"),
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
    const point = trendByKey.get(bucketKey(invoice.issuedAt, trendRange));
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

  const lessonStarts = payments.filter((payment) => payment.kind === "lesson").length;
  const lessonSucceeded = successfulPayments.filter((payment) => payment.kind === "lesson").length;
  const courseStarts = payments.filter((payment) => payment.kind === "course").length;
  const courseSucceeded = successfulPayments.filter((payment) => payment.kind === "course").length;
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
      lessons: moneyRows(lessonVolume),
      courses: moneyRows(courseVolume),
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
      course: {
        starts: courseStarts,
        succeeded: courseSucceeded,
        rate: percent(courseSucceeded, courseStarts),
      },
      note:
        "Checkout starts are payment attempts created in the selected window. Succeeded includes succeeded, refunded, and partially refunded attempts because checkout originally completed.",
    },
    learners: {
      active: currentLearners.size,
      previousActive: previousLearners.size,
      retained: retainedLearners,
      retentionRate: percent(retainedLearners, previousLearners.size),
      completionEligible: eligibleEnrollments.length,
      completedEnrollments,
      courseCompletionRate: percent(completedEnrollments, eligibleEnrollments.length),
      retentionNote:
        "Active learner retention denominator is unique non-demo learners with a confirmed/completed lesson or course learning activity in the immediately preceding equal-length window.",
      completionNote:
        "Course completion denominator is non-revoked, non-demo enrollments started in the selected window in courses with at least one lesson; completion requires every current lesson.",
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
  await requirePlatformAdmin();
  const { start, previousStart } = platformAnalyticsWindow(range, now);
  const earliest = previousStart ?? start;

  const [
    paymentRows,
    refundRows,
    disputeRows,
    bookingRows,
    enrollmentRows,
    progressRows,
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
        coursePurchase: {
          select: {
            student: { select: { email: true } },
            teacher: { select: { email: true } },
            course: { select: { organization: { select: { slug: true } } } },
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
        coursePurchase: {
          select: { course: { select: { organization: { select: { slug: true } } } } },
        },
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
            coursePurchase: {
              select: {
                student: { select: { email: true } },
                teacher: { select: { email: true } },
                course: { select: { organization: { select: { slug: true } } } },
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
    db.courseEnrollment.findMany({
      where: earliest
        ? { enrolledAt: { gte: earliest, lte: now } }
        : { enrolledAt: { lte: now } },
      select: {
        id: true,
        studentId: true,
        enrolledAt: true,
        revokedAt: true,
        student: { select: { email: true } },
        course: {
          select: {
            teacher: { select: { email: true } },
            organization: { select: { slug: true } },
            modules: { select: { lessons: { select: { id: true } } } },
          },
        },
      },
    }),
    db.courseLessonProgress.findMany({
      where: {
        completedAt: {
          not: null,
          ...(earliest ? { gte: earliest, lte: now } : { lte: now }),
        },
      },
      select: {
        studentId: true,
        completedAt: true,
        lessonId: true,
        student: { select: { email: true } },
        lesson: {
          select: {
            module: {
              select: {
                courseId: true,
                course: {
                  select: {
                    teacher: { select: { email: true } },
                    organization: { select: { slug: true } },
                  },
                },
              },
            },
          },
        },
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

  const completedByEnrollment = new Map<string, number>();
  for (const enrollment of enrollmentRows) {
    const lessonIds = new Set(
      enrollment.course.modules.flatMap((module) => module.lessons.map((lesson) => lesson.id)),
    );
    const count = progressRows.filter(
      (progress) =>
        progress.studentId === enrollment.studentId && lessonIds.has(progress.lessonId),
    ).length;
    completedByEnrollment.set(enrollment.id, count);
  }

  const fixture: PlatformAnalyticsFixture = {
    payments: paymentRows.flatMap((payment) => {
      const target = payment.booking ?? payment.coursePurchase;
      if (!target) return [];
      return [{
        id: payment.id,
        kind: payment.booking ? "lesson" as const : "course" as const,
        status: payment.status,
        amountCents: payment.amountCents,
        refundedCents: payment.refundedCents,
        currency: payment.currency,
        createdAt: payment.createdAt,
        succeededAt: payment.succeededAt,
        studentEmail: target.student.email,
        teacherEmail: target.teacher.email,
        organizationSlug:
          payment.booking?.organization.slug ??
          payment.coursePurchase?.course.organization.slug ??
          "",
      }];
    }),
    refundRequests: refundRows.map((request) => ({
      id: request.id,
      kind: request.booking ? "lesson" as const : "course" as const,
      status: request.status,
      requestedAmountCents: request.requestedAmountCents,
      providerRefundedCents: request.providerRefundedCents,
      currency: request.currency,
      requestedAt: request.requestedAt,
      studentEmail: request.student.email,
      teacherEmail: request.teacher.email,
      organizationSlug:
        request.booking?.organization.slug ??
        request.coursePurchase?.course.organization.slug ??
        "",
    })),
    disputes: disputeRows.flatMap((dispute) => {
      const target = dispute.paymentAttempt.booking ?? dispute.paymentAttempt.coursePurchase;
      if (!target) return [];
      return [{
        id: dispute.id,
        status: dispute.status,
        amountCents: dispute.amountCents ?? dispute.paymentAttempt.amountCents,
        currency: dispute.currency ?? dispute.paymentAttempt.currency,
        openedAt: dispute.openedAt,
        studentEmail: target.student.email,
        teacherEmail: target.teacher.email,
        organizationSlug:
          dispute.paymentAttempt.booking?.organization.slug ??
          dispute.paymentAttempt.coursePurchase?.course.organization.slug ??
          "",
      }];
    }),
    learnerActivity: [
      ...bookingRows.map((booking) => ({
        studentId: booking.studentId,
        occurredAt: booking.startsAt,
        studentEmail: booking.student.email,
        teacherEmail: booking.teacher.email,
        organizationSlug: booking.organization.slug,
      })),
      ...progressRows.flatMap((progress) =>
        progress.completedAt
          ? [{
              studentId: progress.studentId,
              occurredAt: progress.completedAt,
              studentEmail: progress.student.email,
              teacherEmail: progress.lesson.module.course.teacher.email,
              organizationSlug: progress.lesson.module.course.organization.slug,
            }]
          : [],
      ),
    ],
    courseEnrollments: enrollmentRows.map((enrollment) => ({
      id: enrollment.id,
      studentId: enrollment.studentId,
      enrolledAt: enrollment.enrolledAt,
      revokedAt: enrollment.revokedAt,
      lessonCount: enrollment.course.modules.reduce(
        (count, module) => count + module.lessons.length,
        0,
      ),
      completedLessonCount: completedByEnrollment.get(enrollment.id) ?? 0,
      studentEmail: enrollment.student.email,
      teacherEmail: enrollment.course.teacher.email,
      organizationSlug: enrollment.course.organization.slug,
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

  return summarizePlatformAnalytics(fixture, range, now);
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
    rows.push(["teacher_processed_volume", "all", row.currency, row.grossCents, row.refundedCents, row.netCents, row.count, ""]);
  }
  for (const row of data.teacherVolume.lessons) {
    rows.push(["teacher_processed_volume", "lesson", row.currency, row.grossCents, row.refundedCents, row.netCents, row.count, ""]);
  }
  for (const row of data.teacherVolume.courses) {
    rows.push(["teacher_processed_volume", "course", row.currency, row.grossCents, row.refundedCents, row.netCents, row.count, ""]);
  }
  for (const row of data.refunds.reportedByCurrency) {
    rows.push(["refunds", "reported_amount", row.currency, "", "", row.amountCents, data.teacherVolume.successfulTransactions, data.refunds.refundRate]);
  }
  rows.push(["conversion", "lesson_checkout", "", "", "", data.conversion.lesson.succeeded, data.conversion.lesson.starts, data.conversion.lesson.rate]);
  rows.push(["conversion", "course_checkout", "", "", "", data.conversion.course.succeeded, data.conversion.course.starts, data.conversion.course.rate]);
  rows.push(["learners", "active_retention", "", "", "", data.learners.retained, data.learners.previousActive, data.learners.retentionRate]);
  rows.push(["learners", "course_completion", "", "", "", data.learners.completedEnrollments, data.learners.completionEligible, data.learners.courseCompletionRate]);
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
