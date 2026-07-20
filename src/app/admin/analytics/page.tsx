import {
  Activity,
  BookOpenCheck,
  CircleDollarSign,
  Download,
  RefreshCcw,
  ShieldAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { AdminPageHeader } from "@/features/admin/components/admin-page-header";
import { StatCard } from "@/features/admin/components/stat-card";
import { AnalyticsRangeFilter } from "@/features/teacher-dashboard/components/analytics-range-filter";
import { AnalyticsTrendBars } from "@/features/teacher-dashboard/components/analytics-trend-bars";
import { formatCurrency } from "@/lib/format";
import {
  getPlatformAnalytics,
  parseAnalyticsRange,
} from "@/server/admin/platform-analytics";

function rate(value: number, numerator: number, denominator: number) {
  return `${value}% · ${numerator.toLocaleString("en-ZA")} of ${denominator.toLocaleString("en-ZA")}`;
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  const query = await searchParams;
  const range = parseAnalyticsRange(
    Array.isArray(query.range) ? query.range[0] : query.range,
  );
  const data = await getPlatformAnalytics(range);
  const primaryVolume = data.teacherVolume.byCurrency.find(
    (row) => row.currency === data.primaryTeacherCurrency,
  );
  const primaryMrr = data.subscriptions.mrrByCurrency[0];
  const teacherTrend = data.trend.map((point) => ({
    key: point.key,
    label: point.label,
    netCents: point.teacherNetCents,
    enrollments: point.lessonCheckoutSucceeded + point.courseCheckoutSucceeded,
    completedLessons: 0,
  }));
  const platformTrend = data.trend.map((point) => ({
    key: point.key,
    label: point.label,
    netCents: point.platformRevenueCents,
    enrollments: 0,
    completedLessons: 0,
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-10">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <AdminPageHeader
          title="Platform analytics"
          description={`Operations and finance reporting for ${data.rangeLabel.toLowerCase()}. Demo accounts are excluded throughout.`}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Suspense fallback={<div className="h-8 w-64 animate-pulse rounded-lg bg-muted" />}>
            <AnalyticsRangeFilter range={range} />
          </Suspense>
          <Button variant="outline" render={<Link href={`/api/v1/admin/analytics/export?range=${range}`} />}>
            <Download className="size-4" aria-hidden />
            Export CSV
          </Button>
        </div>
      </div>

      <section className="space-y-4">
        <SectionHeading
          title="Teacher-processed transaction volume"
          description={data.teacherVolume.note}
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label={`Net volume (${data.primaryTeacherCurrency})`}
            value={primaryVolume?.netLabel ?? formatCurrency(0, data.primaryTeacherCurrency)}
            detail={
              data.teacherVolume.byCurrency.length > 1
                ? `${data.teacherVolume.byCurrency.length} separate currency buckets`
                : `${data.teacherVolume.successfulTransactions} successful transactions`
            }
            icon={CircleDollarSign}
          />
          <StatCard
            label="Refund rate"
            value={`${data.refunds.refundRate}%`}
            detail={data.refunds.refundRateNote}
            icon={RefreshCcw}
          />
          <StatCard
            label="Lesson checkout"
            value={`${data.conversion.lesson.rate}%`}
            detail={`${data.conversion.lesson.succeeded} succeeded of ${data.conversion.lesson.starts} starts`}
            icon={Activity}
          />
          <StatCard
            label="Course checkout"
            value={`${data.conversion.course.rate}%`}
            detail={`${data.conversion.course.succeeded} succeeded of ${data.conversion.course.starts} starts`}
            icon={BookOpenCheck}
          />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="font-semibold">Teacher volume trend</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Net verified volume in {data.primaryTeacherCurrency}
            {data.teacherVolume.byCurrency.length > 1 ? "; other currencies remain in the table" : ""}
          </p>
          <div className="mt-6">
            <AnalyticsTrendBars
              points={teacherTrend}
              metric="netCents"
              currency={data.primaryTeacherCurrency}
            />
          </div>
        </article>
        <article className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="font-semibold">Platform subscription revenue trend</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Paid subscription invoices in {data.primaryPlatformCurrency}; excludes teacher funds
          </p>
          <div className="mt-6">
            <AnalyticsTrendBars
              points={platformTrend}
              metric="netCents"
              currency={data.primaryPlatformCurrency}
            />
          </div>
        </article>
      </section>

      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-6 py-5">
          <h2 className="font-semibold">Volume by currency and product</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Amounts are intentionally not converted or combined across currencies.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th className="px-6 py-3 font-medium">Currency</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Transactions</th>
                <th className="px-4 py-3 font-medium">Gross</th>
                <th className="px-4 py-3 font-medium">Refunded</th>
                <th className="px-6 py-3 font-medium">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[
                ...data.teacherVolume.lessons.map((row) => ({ ...row, product: "Lessons" })),
                ...data.teacherVolume.courses.map((row) => ({ ...row, product: "Courses" })),
              ].map((row) => (
                <tr key={`${row.product}-${row.currency}`}>
                  <td className="px-6 py-4 font-medium">{row.currency}</td>
                  <td className="px-4 py-4">{row.product}</td>
                  <td className="px-4 py-4">{row.count.toLocaleString("en-ZA")}</td>
                  <td className="px-4 py-4">{row.grossLabel}</td>
                  <td className="px-4 py-4">{row.refundedLabel}</td>
                  <td className="px-6 py-4 font-semibold">{row.netLabel}</td>
                </tr>
              ))}
              {data.teacherVolume.successfulTransactions === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                    No verified teacher-processed transactions in this period.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading
          title="Refund and dispute operations"
          description="Reported amounts are requested refund values; refunded amounts come from the verified payment ledger."
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Refund requests"
            value={data.refunds.requestCount.toLocaleString("en-ZA")}
            detail={`${data.refunds.unresolvedCount} unresolved`}
            icon={RefreshCcw}
          />
          <StatCard
            label="Provider disputes"
            value={data.refunds.disputeCount.toLocaleString("en-ZA")}
            detail={`${data.refunds.openDisputeCount} open or under review`}
            icon={ShieldAlert}
          />
          <StatCard
            label="Active learner retention"
            value={`${data.learners.retentionRate}%`}
            detail={`${data.learners.retained} retained of ${data.learners.previousActive} prior active learners`}
            icon={Users}
          />
          <StatCard
            label="Course completion"
            value={`${data.learners.courseCompletionRate}%`}
            detail={`${data.learners.completedEnrollments} completed of ${data.learners.completionEligible} eligible enrollments`}
            icon={BookOpenCheck}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <MoneyList title="Reported refund amounts" rows={data.refunds.reportedByCurrency} />
          <MoneyList title="Provider-refunded amounts" rows={data.refunds.refundedByCurrency} />
          <MoneyList title="Disputed amounts" rows={data.refunds.disputedByCurrency} />
        </div>
        <div className="rounded-lg border border-border/70 bg-muted/20 p-4 text-xs text-muted-foreground">
          <p>{data.learners.retentionNote}</p>
          <p className="mt-2">{data.learners.completionNote}</p>
          <p className="mt-2">{data.conversion.note}</p>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading
          title="Platform subscription revenue"
          description="Amazing Skills revenue only. Teacher lesson and course payments are excluded."
        />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`MRR${primaryMrr ? ` (${primaryMrr.currency})` : ""}`}
          value={primaryMrr?.amountLabel ?? formatCurrency(0, "USD")}
          detail={
            data.subscriptions.mrrByCurrency.length > 1
              ? `${data.subscriptions.mrrByCurrency.length} separate currency buckets`
              : `${data.subscriptions.activePaidOrganizations} active paid organizations`
          }
          icon={CircleDollarSign}
        />
        <StatCard
          label="Subscription retention"
          value={`${data.subscriptions.retentionRate}%`}
          detail={rate(
            data.subscriptions.retentionRate,
            data.subscriptions.retained,
            data.subscriptions.cohortSize,
          )}
          icon={Activity}
        />
        <StatCard
          label="Subscription churn"
          value={`${data.subscriptions.churnRate}%`}
          detail={`${data.subscriptions.churned} churned of ${data.subscriptions.cohortSize} in cohort`}
          icon={RefreshCcw}
        />
        <StatCard
          label="Scheduled cancellations"
          value={data.subscriptions.scheduledToCancel.toLocaleString("en-ZA")}
          detail="Active paid organizations cancelling at period end"
          icon={ShieldAlert}
        />
      </section>
        <div className="grid gap-4 lg:grid-cols-2">
          <MoneyList title="Current MRR by plan currency" rows={data.subscriptions.mrrByCurrency} />
          <MoneyList
            title="Invoice revenue in selected period"
            rows={data.subscriptions.revenueByCurrency.map((row) => ({
              currency: row.currency,
              amountCents: row.netCents,
              amountLabel: row.netLabel,
            }))}
          />
        </div>
        <p className="rounded-lg border border-border/70 bg-muted/20 p-4 text-xs text-muted-foreground">
          {data.subscriptions.note}
        </p>
      </section>
    </div>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="font-heading text-xl font-semibold">{title}</h2>
      <p className="mt-1 max-w-4xl text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function MoneyList({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ currency: string; amountCents: number; amountLabel: string }>;
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h3 className="text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No amounts in this period.</p>
      ) : (
        <dl className="mt-4 space-y-3">
          {rows.map((row) => (
            <div key={row.currency} className="flex items-center justify-between gap-4">
              <dt className="text-sm text-muted-foreground">{row.currency}</dt>
              <dd className="font-medium">{row.amountLabel}</dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}
