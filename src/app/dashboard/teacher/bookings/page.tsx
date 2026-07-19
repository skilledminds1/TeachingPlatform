import type { Metadata } from "next";

import { TeacherCalendar } from "@/features/calendar/components/teacher-calendar";
import { hasGoogleCalendarEnv } from "@/lib/env";
import { getTeacherCalendarWeek } from "@/server/bookings/calendar";

export const metadata: Metadata = { title: "Calendar" };

export default async function TeacherBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; view?: string; google?: string }>;
}) {
  const query = await searchParams;
  const data = await getTeacherCalendarWeek(query.week);
  const view = query.view === "agenda" ? "agenda" : "week";

  return (
    <div>
      {query.google === "connected" ? (
        <p className="border-b border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-center text-sm text-emerald-800 dark:text-emerald-200">
          Google Calendar connected. Confirmed lessons will sync automatically.
        </p>
      ) : null}
      {query.google === "error" || query.google === "denied" ? (
        <p className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
          Could not connect Google Calendar. Please try again.
        </p>
      ) : null}
      {query.google === "missing_config" ? (
        <p className="border-b border-border bg-muted px-4 py-2 text-center text-sm text-muted-foreground">
          Google Calendar credentials are not configured on this server yet.
        </p>
      ) : null}

      <TeacherCalendar
        weekStartIso={data.weekStartIso}
        weekEndIso={data.weekEndIso}
        timeZone={data.timeZone}
        bookings={data.bookings}
        exceptions={data.exceptions}
        availability={data.availability}
        students={data.students}
        canUseExceptions={data.canUseExceptions}
        googleCalendar={data.googleCalendar}
        googleConfigured={hasGoogleCalendarEnv()}
        allBookings={data.allBookings}
        view={view}
      />
    </div>
  );
}
