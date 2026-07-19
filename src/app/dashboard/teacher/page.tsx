import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock3,
  CreditCard,
  ExternalLink,
  GraduationCap,
  MessageSquare,
  Users,
  Video,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { StatusBadge, statusTone } from "@/features/admin/components/status-badge";
import { SubmitProfileButton } from "@/features/teacher-onboarding/components/submit-profile-button";
import { formatStatus } from "@/lib/format";
import {
  getLiveLessonUsage,
  getStudentUsage,
} from "@/server/billing/entitlements";
import { getTeacherProfileReadiness } from "@/server/teachers/onboarding";

export default async function TeacherDashboardPage() {
  const readiness = await getTeacherProfileReadiness();
  const { user, profile, checks, profileComplete, readyToSubmit } = readiness;

  if (!profile || !profileComplete || profile.status === "rejected") {
    redirect("/onboarding/teacher");
  }
  const [studentUsage, liveLessonUsage] = await Promise.all([
    getStudentUsage(profile.organizationId),
    getLiveLessonUsage(profile.organizationId),
  ]);

  const checklist = [
    { label: "Profile information complete", complete: profileComplete },
    { label: "Email address verified", complete: checks.emailVerified },
    { label: "Payment account linked", complete: checks.paymentLinked },
    { label: "Listing plan active", complete: checks.qualifyingPlan },
  ];

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <GraduationCap className="size-4" aria-hidden />
            </span>
            <span className="hidden sm:inline">Amazing Skills</span>
          </Link>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" render={<Link href="/dashboard/teacher/courses" />}>
              My Courses
            </Button>
            <Button variant="ghost" size="sm" render={<Link href="/find-tutor" />}>
              Find Tutor
            </Button>
            <Button variant="ghost" size="sm" render={<Link href="/dashboard/teacher/profile" />}>
              Profile
            </Button>
            <Button variant="ghost" size="sm" render={<Link href="/dashboard/classroom" />}>
              Classroom
            </Button>
            <Button variant="ghost" size="sm" render={<Link href="/dashboard/messages" />}>
              Messages
            </Button>
            <Button variant="ghost" size="sm" render={<Link href="/dashboard/notifications" />}>
              Notifications
            </Button>
            <form action={signOut}>
              <Button type="submit" variant="outline" size="sm" className="ml-2">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-8 md:py-12">
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
                Manage your lessons, courses, and students from one place.
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
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
              Quick actions
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DashboardLink
            href="/dashboard/classroom"
            icon={Video}
            label="Classroom"
            description="Join and reconnect to live lessons"
          />
          <DashboardLink
            href="/dashboard/messages"
            icon={MessageSquare}
            label="Messages"
            description="Chat with your students"
          />
          <DashboardLink
            href="/dashboard/notifications"
            icon={Bell}
            label="Notifications"
            description="Booking and lesson alerts"
          />
          <DashboardLink
            href="/dashboard/teacher/bookings"
            icon={CalendarDays}
            label="Bookings"
            description="Upcoming lessons and history"
          />
          <DashboardLink
            href="/dashboard/teacher/availability"
            icon={Clock3}
            label="Availability"
            description="Weekly hours and time off"
          />
          <DashboardLink
            href="/dashboard/teacher/billing"
            icon={CreditCard}
            label="Plans & billing"
            description={`${liveLessonUsage.usedMinutes / 60} / ${
              liveLessonUsage.limit === null ? "Unlimited" : liveLessonUsage.limit / 60
            } live hours`}
          />
          <DashboardLink
            href="/dashboard/teacher/payments"
            icon={WalletCards}
            label="Student payments"
            description={checks.paymentLinked ? "PayPal connected" : "Connect PayPal"}
          />
          <DashboardLink
            href="/dashboard/teacher/team"
            icon={Users}
            label="Team"
            description="Members and invitations"
          />
          </div>
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
      </main>
    </div>
  );
}

function DashboardLink({
  href,
  icon: Icon,
  label,
  description,
}: {
  href: string;
  icon: typeof CreditCard;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          <Icon className="size-4.5" aria-hidden />
        </div>
        <ArrowUpRight
          className="size-4 text-muted-foreground/50 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary"
          aria-hidden
        />
      </div>
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}
