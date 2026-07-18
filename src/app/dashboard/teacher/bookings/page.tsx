import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { BookingList } from "@/features/bookings/components/booking-list";
import { getTeacherBookings } from "@/server/bookings/calendar";

export const metadata: Metadata = { title: "Teacher bookings" };

export default async function TeacherBookingsPage() {
  const { user, bookings } = await getTeacherBookings();

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-4xl items-center px-6">
          <Button variant="ghost" render={<Link href="/dashboard/teacher" />}>
            <ArrowLeft className="size-4" aria-hidden />
            Teacher dashboard
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
        <div>
          <p className="text-sm text-muted-foreground">Calendar</p>
          <h1 className="text-3xl font-semibold tracking-tight">Student bookings</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Times are shown in {user.timezone}.
          </p>
        </div>
        <BookingList bookings={bookings} viewer="teacher" timeZone={user.timezone} />
      </main>
    </div>
  );
}
