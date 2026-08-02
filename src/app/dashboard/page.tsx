import { CountryBackfillPrompt } from "@/features/compliance/components/country-backfill-prompt";
import {
  CalendarDays,
  GraduationCap,
  Search,
  Star,
  UserRound,
  Video,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/features/admin/components/empty-state";
import { StatusBadge, statusTone } from "@/features/admin/components/status-badge";
import { StudentNavWithNotifications } from "@/features/student-dashboard/components/student-nav-with-notifications";
import { formatCurrency, formatDateTime, formatStatus } from "@/lib/format";
import { getCurrentUser, getPostAuthRedirect } from "@/server/auth/session";
import { getStudentDashboardData } from "@/server/students/dashboard";

export const metadata: Metadata = {
  title: "Student dashboard",
  description: "Your lessons, teachers, and bookings on Amazing Skills.",
};

export default async function StudentDashboardPage() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    redirect("/login?redirect=/dashboard");
  }

  const preferred = await getPostAuthRedirect(sessionUser);
  if (preferred !== "/dashboard") {
    redirect(preferred);
  }

  const { user, upcomingBookings, recentBookings, teachers, completedLessons, reviewsDue } =
    await getStudentDashboardData();

  return (
    <div className="min-h-screen bg-muted/30">
      <StudentNavWithNotifications />

      <main id="main-content" className="mx-auto max-w-6xl space-y-8 px-6 py-8 md:py-12">
        <CountryBackfillPrompt country={user.country} />
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent"
            aria-hidden
          />
          <div className="relative space-y-2">
            <p className="text-xs font-medium tracking-wide text-primary uppercase">
              Student dashboard
            </p>
            <h1 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">
              Welcome, {user.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              Track your lessons, teachers, and courses in one place.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            icon={CalendarDays}
            label="Upcoming lessons"
            value={String(upcomingBookings.length)}
          />
          <StatCard
            icon={GraduationCap}
            label="Completed lessons"
            value={String(completedLessons)}
          />
          <StatCard icon={UserRound} label="My teachers" value={String(teachers.length)} />
        </div>

        {reviewsDue > 0 ? (
          <div className="flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-5">
            <Star className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            <div>
              <p className="font-medium">
                You have {reviewsDue} lesson{reviewsDue === 1 ? "" : "s"} to review
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Reviews help other students find great teachers. Rate your recent lessons below.
              </p>
            </div>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-6">
            <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
                <h2 className="font-heading font-semibold">Upcoming lessons</h2>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    render={<Link href="/dashboard/classroom" />}
                  >
                    Classroom
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    render={<Link href="/dashboard/bookings" />}
                  >
                    View calendar
                  </Button>
                </div>
              </div>
              {upcomingBookings.length > 0 ? (
                <ul className="divide-y divide-border">
                  {upcomingBookings.map((booking) => (
                    <li
                      key={booking.id}
                      className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <UserRound className="size-4" aria-hidden />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{booking.teacher.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(booking.startsAt, user.timezone)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusBadge tone={statusTone(booking.status)}>
                          {formatStatus(booking.status)}
                        </StatusBadge>
                        {booking.videoSession ? (
                          <Button
                            size="sm"
                            render={<Link href={`/sessions/${booking.videoSession.id}`} />}
                          >
                            <Video className="size-3.5" aria-hidden />
                            {booking.videoSession.status === "live" ? "Join now" : "Open lobby"}
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon={CalendarDays}
                  title="No upcoming lessons"
                  description="Browse Find Tutor to find a teacher and book your first session."
                />
              )}
            </section>

            <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="border-b border-border/60 px-5 py-4">
                <h2 className="font-heading font-semibold">Recent lessons</h2>
              </div>
              {recentBookings.length > 0 ? (
                <ul className="divide-y divide-border">
                  {recentBookings.map((booking) => (
                    <li
                      key={booking.id}
                      className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium">{booking.teacher.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(booking.startsAt, user.timezone)}
                        </p>
                      </div>
                      {booking.review ? (
                        <span className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Star
                            className="size-3.5 fill-amber-400 text-amber-400"
                            aria-hidden
                          />
                          {booking.review.rating}/5
                        </span>
                      ) : (
                        <StatusBadge tone="warning">Review pending</StatusBadge>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon={GraduationCap}
                  title="No completed lessons yet"
                  description="Your lesson history and reviews will appear here after your first session."
                />
              )}
            </section>
          </div>

          <div className="space-y-6">
            <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="border-b border-border/60 px-5 py-4">
                <h2 className="font-heading font-semibold">My teachers</h2>
              </div>
              {teachers.length > 0 ? (
                <ul className="divide-y divide-border">
                  {teachers.map((relationship) => {
                    const profile = relationship.teacher.teacherProfile;
                    return (
                      <li key={relationship.id} className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <UserRound className="size-4" aria-hidden />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {relationship.teacher.name}
                            </p>
                            {profile ? (
                              <p className="truncate text-xs text-muted-foreground">
                                {profile.headline ?? "Teacher"} ·{" "}
                                {formatCurrency(profile.hourlyRateCents, profile.currency)}
                                /hour
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState
                  icon={UserRound}
                  title="No teachers yet"
                  description="When a teacher accepts you as a student, they will appear here."
                />
              )}
            </section>

            <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent"
                aria-hidden
              />
              <div className="relative flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Search className="size-5" aria-hidden />
              </div>
              <h2 className="relative mt-4 font-heading font-semibold">Find your next teacher</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Browse verified teachers by subject, rate, and availability.
              </p>
              <Button className="relative mt-5 w-full" render={<Link href="/find-tutor" />}>
                Find a tutor
              </Button>
            </section>
            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <GraduationCap className="size-5" aria-hidden />
              </div>
              <h2 className="mt-4 font-heading font-semibold">Explore courses</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Browse self-paced courses created and sold by teachers.
              </p>
              <Button className="mt-5 w-full" variant="outline" render={<Link href="/courses" />}>
                Browse courses
              </Button>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-5" aria-hidden />
      </div>
      <div>
        <p className="font-heading text-2xl font-semibold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
