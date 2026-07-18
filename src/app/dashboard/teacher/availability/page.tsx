import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ScheduleEditor } from "@/features/availability/components/schedule-editor";
import { getTeacherSchedule } from "@/server/availability/schedule";

export const metadata: Metadata = {
  title: "Availability",
  description: "Manage your weekly teaching hours and blocked dates.",
};

export default async function TeacherAvailabilityPage() {
  const schedule = await getTeacherSchedule();

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-5xl items-center px-6">
          <Button variant="ghost" render={<Link href="/dashboard/teacher" />}>
            <ArrowLeft className="size-4" aria-hidden />
            Teacher dashboard
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
        <div>
          <p className="text-sm text-muted-foreground">Scheduling</p>
          <h1 className="text-3xl font-semibold tracking-tight">Availability</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Students can book 60-minute lessons from these hours, at least two hours ahead.
          </p>
        </div>
        <ScheduleEditor
          initialSlots={schedule.weekly}
          initialExceptions={schedule.exceptions.map((item) => ({ ...item, dayOfWeek: 0 }))}
          timeZone={schedule.timeZone}
        />
      </main>
    </div>
  );
}
