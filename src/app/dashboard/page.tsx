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

import { signOut } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/features/admin/components/empty-state";
import { StatusBadge, statusTone } from "@/features/admin/components/status-badge";
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
    <div className="min-h-screen bg-muted/20">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="font-semibold tracking-tight">
            Amazing Skills
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" render={<Link href="/dashboard/classroom" />}>
              Classroom
            </Button>
            <Button variant="ghost" render={<Link href="/dashboard/messages" />}>
              Messages
            </Button>
            <Button variant="ghost" render={<Link href="/dashboard/notifications" />}>
              Notifications
            </Button>
            <Button variant="ghost" render={<Link href="/teachers" />}>
              Find tutors
            </Button>
            <form action={signOut}>
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-10 md:py-14">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Student dashboard</p>
          <h1 className="text-3xl font-semibold tracking-tight">Welcome, {user.name}</h1>
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
          <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-5">
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
            <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h2 className="font-semibold">Upcoming lessons</h2>
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
                            {formatDateTime(booking.startsAt)}
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
                  description="Browse the marketplace to find a teacher and book your first session."
                />
              )}
            </section>

            <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="border-b border-border px-5 py-4">
                <h2 className="font-semibold">Recent lessons</h2>
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
                          {formatDateTime(booking.startsAt)}
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
            <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="border-b border-border px-5 py-4">
                <h2 className="font-semibold">My teachers</h2>
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

            <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Search className="size-4" aria-hidden />
              </div>
              <h2 className="mt-4 font-semibold">Find your next teacher</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Browse verified teachers by subject, rate, and availability.
              </p>
              <Button className="mt-5 w-full" render={<Link href="/teachers" />}>
                Browse the marketplace
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
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" aria-hidden />
      </div>
      <div>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
