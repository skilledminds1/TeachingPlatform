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
import { requireTeacher } from "@/server/auth/session";

export type { AnalyticsRange } from "@/features/teacher-dashboard/lib/analytics-range";
export {
  ANALYTICS_RANGES,
  analyticsRangeLabel,
  parseAnalyticsRange,
} from "@/features/teacher-dashboard/lib/analytics-range";


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
  completedLessons: number;
  netCentsByCurrency: Record<string, number>;
};

// INT-14: the window, the bucket keys and the labels all used to be computed in UTC here,
// and again in src/server/admin/platform-analytics.ts. They now come from one zone-aware
// module so a teacher's day boundary is their own — see src/server/analytics/buckets.ts.

function emptyMoney(currency: string): MoneyBucket {
  return { currency, grossCents: 0, refundedCents: 0, netCents: 0, count: 0 };
}

function accumulateMoney(
  map: Map<string, MoneyBucket>,
  currency: string,
  amountCents: number,
  refundedCents: number,
) {
  const current = map.get(currency) ?? emptyMoney(currency);
  current.grossCents += amountCents;
  current.refundedCents += refundedCents;
  current.netCents += amountCents - refundedCents;
  current.count += 1;
  map.set(currency, current);
}

function moneyList(map: Map<string, MoneyBucket>) {
  return [...map.values()]
    .sort((a, b) => b.netCents - a.netCents || a.currency.localeCompare(b.currency))
    .map((item) => ({
      ...item,
      grossLabel: formatCurrency(item.grossCents, item.currency),
      refundedLabel: formatCurrency(item.refundedCents, item.currency),
      netLabel: formatCurrency(item.netCents, item.currency),
    }));
}

function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function deltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function buildTrendScaffold(
  range: AnalyticsRange,
  start: Date | null,
  end: Date,
  timeZone: string,
): TrendPoint[] {
  return bucketKeysInZone(range, start, end, timeZone).map((key) => ({
    key,
    label: bucketLabelInZone(key),
    completedLessons: 0,
    netCentsByCurrency: {},
  }));
}

function inWindow(date: Date | null | undefined, start: Date | null, end: Date | null): boolean {
  if (!date) return false;
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

export async function getTeacherAnalytics(range: AnalyticsRange = "30d") {
  const user = await requireTeacher();
  // INT-14: the teacher's own calendar decides where a day starts and ends.
  const timeZone = user.timezone;
  const { start, end, previousStart, previousEnd, days } = analyticsWindowInZone(
    range,
    timeZone,
  );
  const teacherId = user.id;

  const [paymentAttempts, bookings, relationships] = await Promise.all([
    // What the teacher marked as received. The platform does not process lesson payments and
    // cannot observe them, so this is a self-reported figure — labelled as such wherever it
    // is displayed, and never presented as reconciled income.
    db.booking.findMany({
      where: { teacherId, paymentReportedAt: { not: null } },
      select: {
        hourlyRateCents: true,
        currency: true,
        paymentReportedAt: true,
        createdAt: true,
      },
      orderBy: { paymentReportedAt: "desc" },
    }),
    db.booking.findMany({
      where: { teacherId },
      select: {
        id: true,
        status: true,
        studentId: true,
        startsAt: true,
        createdAt: true,
      },
    }),
    db.studentRelationship.findMany({
      where: { teacherId },
      select: {
        studentId: true,
        createdAt: true,
      },
    }),
  ]);

  const currentPayments = paymentAttempts.filter((payment) =>
    inWindow(payment.paymentReportedAt ?? payment.createdAt, start, end),
  );
  const previousPayments =
    previousStart && previousEnd
      ? paymentAttempts.filter((payment) =>
          inWindow(payment.paymentReportedAt ?? payment.createdAt, previousStart, previousEnd),
        )
      : [];

  const earningsByCurrency = new Map<string, MoneyBucket>();
  const previousNetByCurrency = new Map<string, number>();

  // No refunded component: a refund the teacher issues happens entirely in their own payment
  // provider, and the platform is never told the amount. Refund REQUESTS are tracked
  // separately; they are a conversation, not a ledger entry.
  for (const payment of currentPayments) {
    accumulateMoney(earningsByCurrency, payment.currency, payment.hourlyRateCents, 0);
  }

  for (const payment of previousPayments) {
    previousNetByCurrency.set(
      payment.currency,
      (previousNetByCurrency.get(payment.currency) ?? 0) + payment.hourlyRateCents,
    );
  }

  const currentBookings = bookings.filter((booking) => inWindow(booking.startsAt, start, end));
  const previousBookings =
    previousStart && previousEnd
      ? bookings.filter((booking) => inWindow(booking.startsAt, previousStart, previousEnd))
      : [];

  const bookingStatusCounts = {
    confirmed: 0,
    completed: 0,
    cancelled: 0,
    no_show: 0,
    pending_teacher_confirmation: 0,
  };
  for (const booking of currentBookings) {
    if (booking.status in bookingStatusCounts) {
      bookingStatusCounts[booking.status as keyof typeof bookingStatusCounts] += 1;
    }
  }
  const completedLessons = bookingStatusCounts.completed;
  const previousCompletedLessons = previousBookings.filter((b) => b.status === "completed").length;

  const studentIds = new Set<string>();
  for (const relationship of relationships) studentIds.add(relationship.studentId);

  const newStudentIds = new Set<string>();
  for (const relationship of relationships) {
    if (inWindow(relationship.createdAt, start, end)) newStudentIds.add(relationship.studentId);
  }

  const previousNewStudentIds = new Set<string>();
  if (previousStart && previousEnd) {
    for (const relationship of relationships) {
      if (inWindow(relationship.createdAt, previousStart, previousEnd)) {
        previousNewStudentIds.add(relationship.studentId);
      }
    }
  }

  const trend = buildTrendScaffold(range, start, end, timeZone);
  const trendIndex = new Map(trend.map((point, index) => [point.key, index]));
  const trendRange = range === "all" ? "365d" : range;

  for (const booking of currentBookings) {
    if (booking.status !== "completed") continue;
    const key = bucketKeyInZone(booking.startsAt, trendRange, timeZone);
    const index = trendIndex.get(key);
    if (index !== undefined) trend[index].completedLessons += 1;
  }

  for (const payment of currentPayments) {
    const when = payment.paymentReportedAt ?? payment.createdAt;
    const key = bucketKeyInZone(when, trendRange, timeZone);
    const index = trendIndex.get(key);
    if (index === undefined) continue;
    trend[index].netCentsByCurrency[payment.currency] =
      (trend[index].netCentsByCurrency[payment.currency] ?? 0) + payment.hourlyRateCents;
  }

  // Prefer a single primary currency for the trend bar (highest net in period).
  const primaryCurrency = moneyList(earningsByCurrency)[0]?.currency ?? "USD";

  const trendSeries = trend.map((point) => ({
    key: point.key,
    label: point.label,
    completedLessons: point.completedLessons,
    netCents: point.netCentsByCurrency[primaryCurrency] ?? 0,
    netLabel: formatCurrency(point.netCentsByCurrency[primaryCurrency] ?? 0, primaryCurrency),
  }));

  const earnings = moneyList(earningsByCurrency);
  const previousNetTotal = [...previousNetByCurrency.values()].reduce((sum, value) => sum + value, 0);
  const currentNetTotal = earnings.reduce((sum, item) => sum + item.netCents, 0);

  return {
    range,
    rangeLabel: analyticsRangeLabel(range),
    days,
    primaryCurrency,
    generatedAt: end,
    kpis: {
      uniqueStudents: studentIds.size,
      newStudents: newStudentIds.size,
      newStudentsDelta: days ? deltaPercent(newStudentIds.size, previousNewStudentIds.size) : null,
      completedLessons,
      completedLessonsDelta: days
        ? deltaPercent(completedLessons, previousCompletedLessons)
        : null,
    },
    earnings: {
      byCurrency: earnings,
      paymentCount: currentPayments.length,
      netDelta:
        days && earnings.length <= 1
          ? deltaPercent(currentNetTotal, previousNetTotal)
          : null,
      note:
        "Net collected is gross successful payments minus recorded refunds. Currencies are kept separate. This is not payout or bank-settled income.",
    },
    bookings: {
      total: currentBookings.length,
      ...bookingStatusCounts,
      completionRate: percent(
        bookingStatusCounts.completed,
        bookingStatusCounts.completed +
          bookingStatusCounts.cancelled +
          bookingStatusCounts.no_show,
      ),
    },
    trend: trendSeries,
  };
}
