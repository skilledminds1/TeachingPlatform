import type { Metadata } from "next";

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
