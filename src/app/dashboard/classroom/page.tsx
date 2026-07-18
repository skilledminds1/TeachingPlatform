import { ArrowLeft, CalendarDays, Video } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { StatusBadge, statusTone } from "@/features/admin/components/status-badge";
import { formatDateTime, formatStatus } from "@/lib/format";
import { getClassroomLessons } from "@/server/classroom/lessons";

export const metadata: Metadata = {
  title: "Classroom",
  description: "Join and reconnect to your Amazing Skills video lessons.",
};

export default async function ClassroomPage() {
  const { user, isTeacher, live, upcoming, recent } = await getClassroomLessons();
  const dashboardHref = isTeacher ? "/dashboard/teacher" : "/dashboard";

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <Button variant="ghost" render={<Link href={dashboardHref} />}>
            <ArrowLeft className="size-4" aria-hidden />
            Dashboard
          </Button>
          <Button
            variant="ghost"
            render={
              <Link
                href={isTeacher ? "/dashboard/teacher/bookings" : "/dashboard/bookings"}
              />
            }
          >
            <CalendarDays className="size-4" aria-hidden />
            Bookings
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-6 py-10">
        <div>
          <p className="text-sm text-muted-foreground">Live lessons</p>
          <h1 className="text-3xl font-semibold tracking-tight">Classroom</h1>
          <p className="mt-2 text-muted-foreground">
            Join your video lessons here. If you disconnect, reopen this page and join again.
          </p>
        </div>

        <LessonSection
          title="Join now"
          empty="No lessons are open right now. Rooms open 15 minutes before the start time."
          lessons={live}
          timeZone={user.timezone}
          primary
        />
        <LessonSection
          title="Upcoming"
          empty="No upcoming confirmed lessons with a classroom yet."
          lessons={upcoming}
          timeZone={user.timezone}
        />
        <LessonSection
          title="Recently ended"
          empty="Ended lessons will appear here for a short while."
          lessons={recent}
          timeZone={user.timezone}
        />
      </main>
    </div>
  );
}

function LessonSection({
  title,
  empty,
  lessons,
  timeZone,
  primary = false,
}: {
  title: string;
  empty: string;
  lessons: Awaited<ReturnType<typeof getClassroomLessons>>["live"];
  timeZone: string;
  primary?: boolean;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {lessons.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground shadow-sm">
          {empty}
        </div>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {lessons.map((lesson) => (
            <li
              key={lesson.bookingId}
              className="flex flex-col gap-4 border-b border-border px-5 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">
                    {lesson.isTeacherViewer ? "Student" : "Teacher"}: {lesson.other.name}
                  </p>
                  {lesson.sessionStatus ? (
                    <StatusBadge tone={statusTone(lesson.sessionStatus)}>
                      {formatStatus(lesson.sessionStatus)}
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone={statusTone(lesson.bookingStatus)}>
                      {formatStatus(lesson.bookingStatus)}
                    </StatusBadge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatDateTime(lesson.startsAt, timeZone)}
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
                    variant={primary || lesson.canJoin || lesson.isLive ? "default" : "outline"}
                    render={<Link href={`/sessions/${lesson.videoSessionId}`} />}
                  >
                    <Video className="size-4" aria-hidden />
                    {lesson.isLive
                      ? "Rejoin classroom"
                      : lesson.canJoin
                        ? "Join classroom"
                        : "Open lobby"}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
