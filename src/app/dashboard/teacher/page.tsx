import { CountryBackfillPrompt } from "@/features/compliance/components/country-backfill-prompt";
import {
  ArrowUpRight,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  Circle,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  Users,
  Video,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { StatCard } from "@/features/admin/components/stat-card";
import { StatusBadge, statusTone } from "@/features/admin/components/status-badge";
import { SubmitProfileButton } from "@/features/teacher-onboarding/components/submit-profile-button";
import { formatCurrency, formatDateTime, formatStatus, formatNumber } from "@/lib/format";
import {
  getLiveLessonUsage,
  getStudentUsage,
} from "@/server/billing/entitlements";
import { getClassroomLessons } from "@/server/classroom/lessons";
import { getTeacherAnalytics } from "@/server/teachers/analytics";
import { getTeacherProfileReadiness } from "@/server/teachers/onboarding";

export default async function TeacherDashboardPage() {
  const readiness = await getTeacherProfileReadiness();
  const { user, profile, checks, profileComplete, readyToSubmit } = readiness;

  if (!profile || !profileComplete || profile.status === "rejected") {
    redirect("/onboarding/teacher");
  }
  const [studentUsage, liveLessonUsage, analytics, classroom] = await Promise.all([
    getStudentUsage(profile.organizationId),
    getLiveLessonUsage(profile.organizationId),
    getTeacherAnalytics("30d"),
    getClassroomLessons(),
  ]);

  const primaryNet = analytics.earnings.byCurrency[0];
  const upcomingLessons = [...classroom.live, ...classroom.upcoming].slice(0, 5);

  const checklist = [
    { label: "Profile information complete", complete: profileComplete },
    { label: "Introduction video uploaded", complete: checks.videoAdded },
    { label: "Email address verified", complete: checks.emailVerified },
    { label: "Payment account linked", complete: checks.paymentLinked },
    { label: "Listing plan active", complete: checks.qualifyingPlan },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-8 md:py-12">
      <CountryBackfillPrompt country={user.country} />
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent"
            aria-hidden
          />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-medium tracking-wide text-primary uppercase">
                Teacher dashboard
              </p>
              <h1 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">
                Welcome, {user.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage your lessons and students from one place.
              </p>
            </div>
            <StatusBadge tone={statusTone(profile.status)}>
              {formatStatus(profile.status)}
            </StatusBadge>
          </div>
        </div>

        {profile.status === "pending_approval" ? (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
            <Clock3 className="mt-0.5 size-5 shrink-0 text-amber-500" aria-hidden />
            <div>
              <p className="font-medium">Profile review in progress</p>
              <p className="mt-1 text-sm text-muted-foreground">
                The review team aims to respond within 48 business hours.
              </p>
            </div>
          </div>
        ) : null}

        {studentUsage.atLimit ? (
          <div className="flex flex-col gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">
                You&apos;ve reached the limit of {studentUsage.limit} active student
                {studentUsage.limit === 1 ? "" : "s"}.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Existing students remain available. Upgrade to{" "}
                {studentUsage.recommendedPlan?.name ?? "the next plan"} to accept new students.
              </p>
            </div>
            <Button render={<Link href="/dashboard/teacher/billing" />}>
              Upgrade plan
            </Button>
          </div>
        ) : null}

        {liveLessonUsage.atLimit ? (
          <div className="flex flex-col gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">
                You&apos;ve used all {liveLessonUsage.limit! / 60} live lesson hours for this
                month.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Existing bookings remain accessible. Upgrade to{" "}
                {liveLessonUsage.recommendedPlan?.name ?? "the next plan"} to accept more.
              </p>
            </div>
            <Button render={<Link href="/dashboard/teacher/billing" />}>
              Upgrade plan
            </Button>
          </div>
        ) : null}

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
              Performance — last 30 days
            </h2>
            <Button
              variant="ghost"
              size="sm"
              render={<Link href="/dashboard/teacher/analytics" />}
            >
              View full analytics
              <ArrowUpRight className="size-3.5" aria-hidden />
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard
              label="Students"
              value={formatNumber(analytics.kpis.uniqueStudents)}
              detail={`${analytics.kpis.newStudents} new this period`}
              icon={Users}
            />
            <StatCard
              label="Completed live lessons"
              value={formatNumber(analytics.kpis.completedLessons)}
              detail={`${liveLessonUsage.usedMinutes / 60} / ${
                liveLessonUsage.limit === null ? "Unlimited" : liveLessonUsage.limit / 60
              } live hours used`}
              icon={CalendarCheck}
            />
            <StatCard
              label="Net collected"
              value={
                primaryNet ? primaryNet.netLabel : formatCurrency(0, analytics.primaryCurrency)
              }
              detail={
                primaryNet
                  ? `${primaryNet.count} payment${primaryNet.count === 1 ? "" : "s"} received`
                  : "No payments in this period"
              }
              icon={CircleDollarSign}
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-border/60 px-6 py-5">
            <div>
              <h2 className="font-heading text-lg font-semibold">Upcoming lessons</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your next confirmed live lessons.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              render={<Link href="/dashboard/teacher/bookings" />}
            >
              <CalendarDays className="size-4" aria-hidden />
              Open calendar
            </Button>
          </div>
          {upcomingLessons.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              No upcoming lessons scheduled. Share your availability so students can book you.
            </div>
          ) : (
            <ul>
              {upcomingLessons.map((lesson) => (
                <li
                  key={lesson.bookingId}
                  className="flex flex-col gap-3 border-b border-border/60 px-6 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{lesson.other.name}</p>
                      {lesson.isLive ? (
                        <StatusBadge tone="success">Live now</StatusBadge>
                      ) : lesson.canJoin ? (
                        <StatusBadge tone="info">Room open</StatusBadge>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatDateTime(lesson.startsAt, user.timezone)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      render={<Link href={`/dashboard/bookings/${lesson.bookingId}`} />}
                    >
                      Details
                    </Button>
                    {lesson.videoSessionId ? (
                      <Button
                        size="sm"
                        variant={lesson.isLive || lesson.canJoin ? "default" : "outline"}
                        render={<Link href={`/sessions/${lesson.videoSessionId}`} />}
                      >
                        <Video className="size-4" aria-hidden />
                        {lesson.isLive ? "Join now" : lesson.canJoin ? "Join classroom" : "Open lobby"}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border/60 px-6 py-5">
            <h2 className="font-heading text-lg font-semibold">Profile readiness</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Complete every item before submitting for approval.
            </p>
          </div>
          <div className="p-6">
            <ul className="grid gap-3 sm:grid-cols-2">
              {checklist.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm"
                >
                  {item.complete ? (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-500" aria-hidden />
                  ) : (
                    <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className={item.complete ? "font-medium" : "text-muted-foreground"}>
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex flex-wrap gap-3">
              {readyToSubmit && profile.status === "draft" ? (
                <SubmitProfileButton />
              ) : null}
              {!checks.qualifyingPlan ? (
                <Button variant="outline" render={<Link href="/#pricing" />}>
                  View listing plans
                  <ExternalLink className="size-3.5" aria-hidden />
                </Button>
              ) : null}
              {!checks.paymentLinked ? (
                <Button
                  variant="outline"
                  render={<Link href="/dashboard/teacher/payments" />}
                >
                  Link payment account
                  <ExternalLink className="size-3.5" aria-hidden />
                </Button>
              ) : null}
            </div>
          </div>
        </section>
    </div>
  );
}

