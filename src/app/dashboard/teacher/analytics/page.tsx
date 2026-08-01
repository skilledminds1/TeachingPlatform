import {
  BookOpen,
  CalendarCheck,
  CircleDollarSign,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { EmptyState } from "@/features/admin/components/empty-state";
import { StatusBadge } from "@/features/admin/components/status-badge";
import { StatCard } from "@/features/admin/components/stat-card";
import { AnalyticsRangeFilter } from "@/features/teacher-dashboard/components/analytics-range-filter";
import { AnalyticsTrendBars } from "@/features/teacher-dashboard/components/analytics-trend-bars";
import { courseStatusTone } from "@/features/courses/lib/labels";
import { formatCurrency, formatStatus, formatNumber } from "@/lib/format";
import {
  getTeacherAnalytics,
  parseAnalyticsRange,
} from "@/server/teachers/analytics";

export const metadata: Metadata = { title: "Analytics" };

function formatDelta(delta: number | null): string {
  if (delta === null) return "No prior-period comparison";
  if (delta === 0) return "No change vs prior period";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta}% vs prior period`;
}

export default async function TeacherAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  const query = await searchParams;
  const range = parseAnalyticsRange(
    Array.isArray(query.range) ? query.range[0] : query.range,
  );
  const data = await getTeacherAnalytics(range);

  const primaryNet = data.earnings.byCurrency[0];
  const bookingTotal =
    data.bookings.completed + data.bookings.cancelled + data.bookings.no_show;
  const bookingBars = [
    { label: "Completed", value: data.bookings.completed },
    { label: "Cancelled", value: data.bookings.cancelled },
    { label: "No-show", value: data.bookings.no_show },
    { label: "Confirmed", value: data.bookings.confirmed },
    { label: "Pending payment", value: data.bookings.pending_payment },
  ];
  const maxBooking = Math.max(1, ...bookingBars.map((item) => item.value));

  const hasAnyActivity =
    data.kpis.uniqueStudents > 0 ||
    data.kpis.enrollments > 0 ||
    data.kpis.completedLessons > 0 ||
    data.earnings.paymentCount > 0 ||
    data.courses.length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-8 md:py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Course performance, students, live lessons, and net collected for{" "}
            {data.rangeLabel.toLowerCase()}.
          </p>
        </div>
        <Suspense fallback={<div className="h-8 w-64 animate-pulse rounded-lg bg-muted" />}>
          <AnalyticsRangeFilter range={range} />
        </Suspense>
      </div>

      {!hasAnyActivity ? (
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <EmptyState
            icon={CircleDollarSign}
            title="No analytics yet"
            description="Once students enroll, book lessons, or purchase courses, performance metrics will appear here."
          />
        </div>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Students"
              value={formatNumber(data.kpis.uniqueStudents)}
              detail={`${formatNumber(data.kpis.newStudents)} new · ${formatDelta(data.kpis.newStudentsDelta)}`}
              icon={Users}
            />
            <StatCard
              label="Course enrollments"
              value={formatNumber(data.kpis.enrollments)}
              detail={formatDelta(data.kpis.enrollmentsDelta)}
              icon={BookOpen}
            />
            <StatCard
              label="Completed live lessons"
              value={formatNumber(data.kpis.completedLessons)}
              detail={formatDelta(data.kpis.completedLessonsDelta)}
              icon={CalendarCheck}
            />
            <StatCard
              label="Net collected"
              value={primaryNet ? primaryNet.netLabel : formatCurrency(0, data.primaryCurrency)}
              detail={
                primaryNet
                  ? `${primaryNet.count} payment${primaryNet.count === 1 ? "" : "s"} · ${formatDelta(data.earnings.netDelta)}`
                  : "No payments in this period"
              }
              icon={CircleDollarSign}
            />
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <article className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-5 space-y-1">
                <h2 className="font-semibold">Activity trend</h2>
                <p className="text-xs text-muted-foreground">
                  Net collected in {data.primaryCurrency}
                  {data.earnings.byCurrency.length > 1
                    ? " (primary currency only)"
                    : ""}
                </p>
              </div>
              <AnalyticsTrendBars
                points={data.trend}
                metric="netCents"
                currency={data.primaryCurrency}
              />
            </article>

            <article className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-5 space-y-1">
                <h2 className="font-semibold">Live lesson outcomes</h2>
                <p className="text-xs text-muted-foreground">
                  {data.bookings.total} scheduled in period
                  {bookingTotal > 0
                    ? ` · ${data.bookings.completionRate}% completed of settled lessons`
                    : ""}
                </p>
              </div>
              <div className="space-y-4">
                {bookingBars.map((item) => (
                  <div key={item.label} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{item.label}</span>
                      <span className="text-muted-foreground">{item.value}</span>
                    </div>
                    <progress
                      value={item.value}
                      max={maxBooking}
                      aria-label={`${item.label}: ${item.value}`}
                      className="h-2 w-full overflow-hidden rounded-full accent-primary"
                    />
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <article className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-5 space-y-1">
                <h2 className="font-semibold">Earnings by currency</h2>
                <p className="text-xs text-muted-foreground">{data.earnings.note}</p>
              </div>
              {data.earnings.byCurrency.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments collected in this period.</p>
              ) : (
                <ul className="space-y-4">
                  {data.earnings.byCurrency.map((item) => (
                    <li
                      key={item.currency}
                      className="flex flex-col gap-1 rounded-lg border border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium">{item.currency}</p>
                        <p className="text-xs text-muted-foreground">
                          Gross {item.grossLabel} · Refunds {item.refundedLabel}
                        </p>
                      </div>
                      <p className="font-semibold">{item.netLabel}</p>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-muted/40 px-4 py-3">
                  <p className="text-xs text-muted-foreground">Live lessons</p>
                  <p className="mt-1 text-sm font-medium">
                    {data.earnings.lessons[0]?.netLabel ?? formatCurrency(0, data.primaryCurrency)}
                    {data.earnings.lessons.length > 1 ? " +" : ""}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/40 px-4 py-3">
                  <p className="text-xs text-muted-foreground">Course sales</p>
                  <p className="mt-1 text-sm font-medium">
                    {data.earnings.courses[0]?.netLabel ?? formatCurrency(0, data.primaryCurrency)}
                    {data.earnings.courses.length > 1 ? " +" : ""}
                  </p>
                </div>
              </div>
            </article>

            <article className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-5 space-y-1">
                <h2 className="font-semibold">Student mix</h2>
                <p className="text-xs text-muted-foreground">
                  Unique people across tutoring relationships and course enrollments
                </p>
              </div>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-border/70 px-4 py-3">
                  <dt className="text-xs text-muted-foreground">Unique students</dt>
                  <dd className="mt-1 text-2xl font-semibold tracking-tight">
                    {data.students.unique}
                  </dd>
                </div>
                <div className="rounded-lg border border-border/70 px-4 py-3">
                  <dt className="text-xs text-muted-foreground">New in period</dt>
                  <dd className="mt-1 text-2xl font-semibold tracking-tight">
                    {data.students.newInPeriod}
                  </dd>
                </div>
                <div className="rounded-lg border border-border/70 px-4 py-3">
                  <dt className="text-xs text-muted-foreground">Tutoring relationships</dt>
                  <dd className="mt-1 text-2xl font-semibold tracking-tight">
                    {data.students.tutoring}
                  </dd>
                </div>
                <div className="rounded-lg border border-border/70 px-4 py-3">
                  <dt className="text-xs text-muted-foreground">Course learners</dt>
                  <dd className="mt-1 text-2xl font-semibold tracking-tight">
                    {data.students.course}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 text-xs text-muted-foreground">
                {data.kpis.certificatesIssued} certificate
                {data.kpis.certificatesIssued === 1 ? "" : "s"} issued in this period ·{" "}
                {data.kpis.activeCourses} published course
                {data.kpis.activeCourses === 1 ? "" : "s"} of {data.kpis.totalCourses} total
              </p>
            </article>
          </section>

          <section className="rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-6 py-5">
              <h2 className="font-semibold">Course performance</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Enrollments and completion use the current curriculum. Revenue is net collected
                in the selected period.
              </p>
            </div>
            {data.courses.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title="No courses yet"
                description="Create a course to track enrollments, completion, and sales here."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[720px] w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-6 py-3 font-medium">Course</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Enrollments</th>
                      <th className="px-4 py-3 font-medium">Completion</th>
                      <th className="px-4 py-3 font-medium">Period sales</th>
                      <th className="px-6 py-3 font-medium">Net collected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.courses.map((course) => (
                      <tr key={course.id} className="border-b border-border/70 last:border-0">
                        <td className="px-6 py-4">
                          <p className="font-medium">{course.title}</p>
                          <p className="text-xs text-muted-foreground">{course.priceLabel}</p>
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge tone={courseStatusTone(course.status)}>
                            {formatStatus(course.status)}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-4">
                          <p>{course.periodEnrollments} in period</p>
                          <p className="text-xs text-muted-foreground">
                            {course.activeEnrollments} active
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <p>{course.completionRate}%</p>
                          <p className="text-xs text-muted-foreground">
                            {course.completedStudents} finished
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          {course.periodCertificates > 0
                            ? `${course.succeededPurchases} sold · ${course.periodCertificates} certs`
                            : `${course.succeededPurchases} sold`}
                        </td>
                        <td className="px-6 py-4 font-medium">
                          {course.revenue[0]?.netLabel ?? "—"}
                          {course.revenue.length > 1 ? " +" : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
