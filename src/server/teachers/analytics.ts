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

const PAYMENT_STATUSES = ["succeeded", "refunded", "partially_refunded"] as const;

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
  enrollments: number;
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
    enrollments: 0,
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

  const [
    paymentAttempts,
    bookings,
    relationships,
    enrollments,
    courses,
    certificates,
    lessonCompletions,
  ] = await Promise.all([
    db.paymentAttempt.findMany({
      where: {
        status: { in: [...PAYMENT_STATUSES] },
        OR: [{ booking: { teacherId } }, { coursePurchase: { teacherId } }],
      },
      select: {
        amountCents: true,
        refundedCents: true,
        currency: true,
        succeededAt: true,
        createdAt: true,
        bookingId: true,
        coursePurchaseId: true,
        booking: { select: { teacherId: true } },
        coursePurchase: { select: { teacherId: true, courseId: true } },
      },
      orderBy: { succeededAt: "desc" },
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
        status: true,
        createdAt: true,
      },
    }),
    db.courseEnrollment.findMany({
      where: { course: { teacherId } },
      select: {
        id: true,
        courseId: true,
        studentId: true,
        enrolledAt: true,
        revokedAt: true,
      },
    }),
    db.course.findMany({
      where: { teacherId, deletedAt: null },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        priceCents: true,
        currency: true,
        publishedAt: true,
        modules: {
          select: {
            lessons: { select: { id: true } },
          },
        },
        _count: {
          select: {
            enrollments: { where: { revokedAt: null } },
            purchases: { where: { status: "succeeded" } },
            certificates: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    db.courseCertificate.findMany({
      where: { teacherId },
      select: { id: true, courseId: true, issuedAt: true },
    }),
    db.courseLessonProgress.findMany({
      where: {
        completedAt: { not: null },
        lesson: { module: { course: { teacherId } } },
      },
      select: {
        lessonId: true,
        studentId: true,
        completedAt: true,
        lesson: {
          select: {
            module: { select: { courseId: true } },
          },
        },
      },
    }),
  ]);

  const currentPayments = paymentAttempts.filter((attempt) =>
    inWindow(attempt.succeededAt ?? attempt.createdAt, start, end),
  );
  const previousPayments =
    previousStart && previousEnd
      ? paymentAttempts.filter((attempt) =>
          inWindow(attempt.succeededAt ?? attempt.createdAt, previousStart, previousEnd),
        )
      : [];

  const earningsByCurrency = new Map<string, MoneyBucket>();
  const lessonEarningsByCurrency = new Map<string, MoneyBucket>();
  const courseEarningsByCurrency = new Map<string, MoneyBucket>();
  const previousNetByCurrency = new Map<string, number>();
  const courseRevenue = new Map<string, Map<string, MoneyBucket>>();

  for (const attempt of currentPayments) {
    const isLesson = Boolean(attempt.bookingId);
    accumulateMoney(earningsByCurrency, attempt.currency, attempt.amountCents, attempt.refundedCents);
    if (isLesson) {
      accumulateMoney(
        lessonEarningsByCurrency,
        attempt.currency,
        attempt.amountCents,
        attempt.refundedCents,
      );
    } else {
      accumulateMoney(
        courseEarningsByCurrency,
        attempt.currency,
        attempt.amountCents,
        attempt.refundedCents,
      );
      const courseId = attempt.coursePurchase?.courseId;
      if (courseId) {
        const byCurrency = courseRevenue.get(courseId) ?? new Map<string, MoneyBucket>();
        accumulateMoney(byCurrency, attempt.currency, attempt.amountCents, attempt.refundedCents);
        courseRevenue.set(courseId, byCurrency);
      }
    }
  }

  for (const attempt of previousPayments) {
    const net = attempt.amountCents - attempt.refundedCents;
    previousNetByCurrency.set(
      attempt.currency,
      (previousNetByCurrency.get(attempt.currency) ?? 0) + net,
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
    pending_payment: 0,
  };
  for (const booking of currentBookings) {
    if (booking.status in bookingStatusCounts) {
      bookingStatusCounts[booking.status as keyof typeof bookingStatusCounts] += 1;
    }
  }
  const completedLessons = bookingStatusCounts.completed;
  const previousCompletedLessons = previousBookings.filter((b) => b.status === "completed").length;

  const activeEnrollments = enrollments.filter((item) => !item.revokedAt);
  const periodEnrollments = enrollments.filter((item) => inWindow(item.enrolledAt, start, end));
  const previousEnrollments =
    previousStart && previousEnd
      ? enrollments.filter((item) => inWindow(item.enrolledAt, previousStart, previousEnd))
      : [];

  const studentIds = new Set<string>();
  for (const relationship of relationships) studentIds.add(relationship.studentId);
  for (const enrollment of activeEnrollments) studentIds.add(enrollment.studentId);

  const newStudentIds = new Set<string>();
  for (const relationship of relationships) {
    if (inWindow(relationship.createdAt, start, end)) newStudentIds.add(relationship.studentId);
  }
  for (const enrollment of periodEnrollments) {
    if (inWindow(enrollment.enrolledAt, start, end)) newStudentIds.add(enrollment.studentId);
  }

  const previousNewStudentIds = new Set<string>();
  if (previousStart && previousEnd) {
    for (const relationship of relationships) {
      if (inWindow(relationship.createdAt, previousStart, previousEnd)) {
        previousNewStudentIds.add(relationship.studentId);
      }
    }
    for (const enrollment of enrollments) {
      if (inWindow(enrollment.enrolledAt, previousStart, previousEnd)) {
        previousNewStudentIds.add(enrollment.studentId);
      }
    }
  }

  const certificatesInPeriod = certificates.filter((item) => inWindow(item.issuedAt, start, end));

  const trend = buildTrendScaffold(range, start, end, timeZone);
  const trendIndex = new Map(trend.map((point, index) => [point.key, index]));
  const trendRange = range === "all" ? "365d" : range;

  for (const enrollment of periodEnrollments) {
    const key = bucketKeyInZone(enrollment.enrolledAt, trendRange, timeZone);
    const index = trendIndex.get(key);
    if (index !== undefined) trend[index].enrollments += 1;
  }

  for (const booking of currentBookings) {
    if (booking.status !== "completed") continue;
    const key = bucketKeyInZone(booking.startsAt, trendRange, timeZone);
    const index = trendIndex.get(key);
    if (index !== undefined) trend[index].completedLessons += 1;
  }

  for (const attempt of currentPayments) {
    const when = attempt.succeededAt ?? attempt.createdAt;
    const key = bucketKeyInZone(when, trendRange, timeZone);
    const index = trendIndex.get(key);
    if (index === undefined) continue;
    const net = attempt.amountCents - attempt.refundedCents;
    trend[index].netCentsByCurrency[attempt.currency] =
      (trend[index].netCentsByCurrency[attempt.currency] ?? 0) + net;
  }

  // Prefer a single primary currency for the trend bar (highest net in period).
  const primaryCurrency =
    moneyList(earningsByCurrency)[0]?.currency ??
    courses.find((course) => course.currency)?.currency ??
    "USD";

  const trendSeries = trend.map((point) => ({
    key: point.key,
    label: point.label,
    enrollments: point.enrollments,
    completedLessons: point.completedLessons,
    netCents: point.netCentsByCurrency[primaryCurrency] ?? 0,
    netLabel: formatCurrency(point.netCentsByCurrency[primaryCurrency] ?? 0, primaryCurrency),
  }));

  const completionsByCourseStudent = new Map<string, Set<string>>();
  for (const progress of lessonCompletions) {
    if (!progress.completedAt) continue;
    const courseId = progress.lesson.module.courseId;
    const key = `${courseId}:${progress.studentId}`;
    const set = completionsByCourseStudent.get(key) ?? new Set<string>();
    set.add(progress.lessonId);
    completionsByCourseStudent.set(key, set);
  }

  const courseRows = courses.map((course) => {
    const lessonIds = course.modules.flatMap((module) => module.lessons.map((lesson) => lesson.id));
    const lessonCount = lessonIds.length;
    const courseEnrollments = activeEnrollments.filter((item) => item.courseId === course.id);
    let completedStudents = 0;
    if (lessonCount > 0) {
      for (const enrollment of courseEnrollments) {
        const completed = completionsByCourseStudent.get(`${course.id}:${enrollment.studentId}`);
        if (completed && lessonIds.every((id) => completed.has(id))) {
          completedStudents += 1;
        }
      }
    }
    const revenue = moneyList(courseRevenue.get(course.id) ?? new Map());
    const periodEnrollmentCount = periodEnrollments.filter((item) => item.courseId === course.id).length;
    const periodCertificateCount = certificatesInPeriod.filter((item) => item.courseId === course.id)
      .length;

    return {
      id: course.id,
      title: course.title,
      slug: course.slug,
      status: course.status,
      priceLabel:
        course.priceCents === 0 ? "Free" : formatCurrency(course.priceCents, course.currency),
      activeEnrollments: course._count.enrollments,
      succeededPurchases: course._count.purchases,
      certificates: course._count.certificates,
      periodEnrollments: periodEnrollmentCount,
      periodCertificates: periodCertificateCount,
      completionRate: percent(completedStudents, courseEnrollments.length),
      completedStudents,
      revenue,
      primaryNetCents: revenue[0]?.netCents ?? 0,
    };
  });

  courseRows.sort(
    (a, b) =>
      b.periodEnrollments - a.periodEnrollments ||
      b.primaryNetCents - a.primaryNetCents ||
      b.activeEnrollments - a.activeEnrollments,
  );

  const earnings = moneyList(earningsByCurrency);
  const previousNetTotal = [...previousNetByCurrency.values()].reduce((sum, value) => sum + value, 0);
  const currentNetTotal = earnings.reduce((sum, item) => sum + item.netCents, 0);

  const tutoringStudentCount = new Set(relationships.map((item) => item.studentId)).size;
  const courseStudentCount = new Set(activeEnrollments.map((item) => item.studentId)).size;

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
      enrollments: periodEnrollments.length,
      enrollmentsDelta: days
        ? deltaPercent(periodEnrollments.length, previousEnrollments.length)
        : null,
      completedLessons,
      completedLessonsDelta: days
        ? deltaPercent(completedLessons, previousCompletedLessons)
        : null,
      certificatesIssued: certificatesInPeriod.length,
      activeCourses: courses.filter((course) => course.status === "published").length,
      totalCourses: courses.length,
    },
    students: {
      unique: studentIds.size,
      tutoring: tutoringStudentCount,
      course: courseStudentCount,
      newInPeriod: newStudentIds.size,
      activeRelationships: relationships.filter((item) => item.status === "active").length,
    },
    earnings: {
      byCurrency: earnings,
      lessons: moneyList(lessonEarningsByCurrency),
      courses: moneyList(courseEarningsByCurrency),
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
    courses: courseRows.slice(0, 12),
  };
}
