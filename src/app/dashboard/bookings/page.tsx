import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { BookingList } from "@/features/bookings/components/booking-list";
import { GoogleCalendarConnectCard } from "@/features/calendar/components/google-calendar-connect-card";
import { hasGoogleCalendarEnv } from "@/lib/env";
import { requireAuth } from "@/server/auth/session";
import { getStudentBookings } from "@/server/bookings/calendar";
import { getCalendarConnection } from "@/server/integrations/google-calendar";

export const metadata: Metadata = { title: "My bookings" };

export default async function StudentBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  const query = await searchParams;
  const [user, bookings] = await Promise.all([requireAuth(), getStudentBookings()]);
  const connection = await getCalendarConnection(user.id);

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-4xl items-center px-6">
          <Button variant="ghost" render={<Link href="/dashboard" />}>
            <ArrowLeft className="size-4" aria-hidden />
            Student dashboard
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
        <div>
          <p className="text-sm text-muted-foreground">Calendar</p>
          <h1 className="text-3xl font-semibold tracking-tight">My bookings</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Times are shown in {user.timezone}.
          </p>
        </div>

        {query.google === "connected" ? (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-800 dark:text-emerald-200">
            Google Calendar connected. Confirmed lessons will sync automatically.
          </p>
        ) : null}

        <GoogleCalendarConnectCard
          connected={Boolean(connection)}
          email={connection?.googleEmail ?? null}
          configured={hasGoogleCalendarEnv()}
          returnTo="/dashboard/bookings"
        />

        <BookingList bookings={bookings} viewer="student" timeZone={user.timezone} />
      </main>
    </div>
  );
}
