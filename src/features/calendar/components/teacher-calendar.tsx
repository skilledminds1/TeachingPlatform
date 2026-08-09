"use client";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Link2,
  Link2Off,
} from "lucide-react";
import { DateTime } from "luxon";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteAvailabilityException } from "@/actions/availability";
import { disconnectGoogleCalendar } from "@/actions/google-calendar";
import { Button } from "@/components/ui/button";
import { BookingList } from "@/features/bookings/components/booking-list";
import { LessonInformationDialog } from "@/features/calendar/components/lesson-information-dialog";
import {
  ScheduleDialog,
  type SchedulePrefill,
} from "@/features/calendar/components/schedule-dialog";
import { cn } from "@/lib/utils";
import type {
  CalendarAvailability,
  CalendarBooking,
  CalendarException,
  CalendarStudentOption,
} from "@/server/bookings/calendar";

const HOUR_HEIGHT = 56;
const START_HOUR = 0;
const END_HOUR = 24;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

type ViewMode = "week" | "agenda";

type DragSelection = {
  dayIndex: number;
  startMinutes: number;
  endMinutes: number;
};

function minutesToTime(total: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 30, Math.round(total / 30) * 30));
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function TeacherCalendar({
  weekStartIso,
  timeZone,
  bookings,
  exceptions,
  availability,
  students,
  canUseExceptions,
  googleCalendar,
  googleConfigured,
  allBookings,
  view,
}: {
  weekStartIso: string;
  weekEndIso: string;
  timeZone: string;
  bookings: CalendarBooking[];
  exceptions: CalendarException[];
  availability: CalendarAvailability[];
  students: CalendarStudentOption[];
  canUseExceptions: boolean;
  googleCalendar: { connected: true; email: string | null } | { connected: false; email: null };
  googleConfigured: boolean;
  allBookings: Array<{
    id: string;
    startsAt: Date;
    status: string;
    hourlyRateCents: number;
    currency: string;
    teacher: { name: string };
    student: { name: string };
  }>;
  view: ViewMode;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [prefill, setPrefill] = useState<SchedulePrefill | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<CalendarBooking | null>(null);
  const [lessonOpen, setLessonOpen] = useState(false);
  const [drag, setDrag] = useState<DragSelection | null>(null);
  const dragging = useRef(false);
  const [now, setNow] = useState(() => DateTime.now().setZone(timeZone));
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(DateTime.now().setZone(timeZone));
    }, 60_000);
    return () => window.clearInterval(id);
  }, [timeZone]);

  const weekStart = DateTime.fromISO(weekStartIso, { zone: timeZone }).startOf("day");
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => weekStart.plus({ days: index })),
    [weekStart],
  );

  const rangeLabel = `${weekStart.toFormat("LLL d")} – ${weekStart
    .plus({ days: 6 })
    .toFormat("LLL d, yyyy")}`;

  function openSchedule(next: SchedulePrefill): void {
    setPrefill(next);
    setDialogOpen(true);
  }

  function goToWeek(iso: string): void {
    const params = new URLSearchParams();
    params.set("week", iso);
    if (view === "agenda") params.set("view", "agenda");
    router.push(`/dashboard/teacher/bookings?${params.toString()}`);
  }

  function setView(next: ViewMode): void {
    const params = new URLSearchParams();
    params.set("week", weekStartIso);
    if (next === "agenda") params.set("view", "agenda");
    router.push(`/dashboard/teacher/bookings?${params.toString()}`);
  }

  function pointerMinutes(clientY: number, columnTop: number): number {
    const offset = clientY - columnTop;
    const minutes = (offset / HOUR_HEIGHT) * 60;
    return Math.max(0, Math.min(24 * 60, minutes));
  }

  function onColumnPointerDown(
    event: React.PointerEvent<HTMLDivElement>,
    dayIndex: number,
  ): void {
    if ((event.target as HTMLElement).closest("[data-event]")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const minutes = pointerMinutes(event.clientY, rect.top);
    dragging.current = true;
    setDrag({ dayIndex, startMinutes: minutes, endMinutes: minutes + 60 });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onColumnPointerMove(
    event: React.PointerEvent<HTMLDivElement>,
    dayIndex: number,
  ): void {
    if (!dragging.current || !drag || drag.dayIndex !== dayIndex) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const minutes = pointerMinutes(event.clientY, rect.top);
    setDrag({
      ...drag,
      endMinutes: Math.max(minutes, drag.startMinutes + 30),
    });
  }

  function onColumnPointerUp(
    event: React.PointerEvent<HTMLDivElement>,
    dayIndex: number,
  ): void {
    if (!dragging.current || !drag || drag.dayIndex !== dayIndex) return;
    dragging.current = false;
    const start = Math.min(drag.startMinutes, drag.endMinutes);
    const end = Math.max(drag.startMinutes, drag.endMinutes);
    const day = days[dayIndex]!;
    setDrag(null);
    openSchedule({
      tab: "lesson",
      date: day.toISODate()!,
      startTime: minutesToTime(start),
      endTime: minutesToTime(Math.max(end, start + 60)),
    });
  }

  function removeException(id: string): void {
    startTransition(async () => {
      const result = await deleteAvailabilityException(id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Removed from calendar.");
      router.refresh();
    });
  }

  function disconnectGoogle(): void {
    startTransition(async () => {
      const result = await disconnectGoogleCalendar();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Google Calendar disconnected.");
      router.refresh();
    });
  }

  const nowMinutes = now.hour * 60 + now.minute;

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-background lg:flex-row">
      <aside className="w-full shrink-0 space-y-6 border-b border-border p-4 lg:w-56 lg:border-e lg:border-b-0 lg:p-5">
        <div className="space-y-2">
          <Button
            className="w-full justify-center"
            onClick={() => openSchedule({ tab: "lesson" })}
          >
            Schedule lesson
          </Button>
          <Button
            variant="outline"
            className="w-full justify-center"
            onClick={() => openSchedule({ tab: "time-off" })}
          >
            Add time off
          </Button>
          <Button
            variant="outline"
            className="w-full justify-center"
            onClick={() => openSchedule({ tab: "extra-slots" })}
          >
            Add extra slots
          </Button>
          <Button
            variant="outline"
            className="w-full justify-center"
            render={<Link href="/dashboard/teacher/availability" />}
          >
            Set up availability
          </Button>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Tags
          </p>
          <ul className="space-y-2 text-sm">
            <Legend color="bg-emerald-500" label="First lesson" />
            <Legend color="bg-sky-500" label="Single lesson" />
            <Legend color="bg-amber-500" label="Time off" />
            <Legend color="bg-violet-500" label="Extra slot" />
            <Legend color="bg-zinc-500" label="Google Calendar" />
          </ul>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Lesson status
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <Clock className="size-3.5" aria-hidden />
              Awaiting confirmation
            </li>
            <li className="flex items-center gap-2">
              <Check className="size-3.5" aria-hidden />
              Confirmed lesson
            </li>
          </ul>
        </div>

        <div className="rounded-xl border border-border p-3">
          <p className="text-sm font-medium">Google Calendar</p>
          {googleCalendar.connected ? (
            <div className="mt-2 space-y-2">
              <p className="truncate text-xs text-muted-foreground">
                {googleCalendar.email ?? "Connected"}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={isPending}
                onClick={disconnectGoogle}
              >
                <Link2Off className="size-3.5" aria-hidden />
                Disconnect
              </Button>
            </div>
          ) : googleConfigured ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-2 w-full"
              render={
                // GLO-03: content comes from Button's children — see the connect card.
                //
                // next/link is wrong here and the rule is misfiring: this is a Route Handler
                // that starts an OAuth redirect, not a page, and it needs a real navigation.
                // The rule only began flagging it once app/api/[...unmatched] existed, which
                // makes every /api/ path look like a page to it.
                // eslint-disable-next-line jsx-a11y/anchor-has-content, @next/next/no-html-link-for-pages
                <a href="/api/integrations/google-calendar/connect?returnTo=/dashboard/teacher/bookings" />
              }
            >
              <Link2 className="size-3.5" aria-hidden />
              Connect
            </Button>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Add Google Calendar credentials to enable linking.
            </p>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous week"
              onClick={() => goToWeek(weekStart.minus({ weeks: 1 }).toISODate()!)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next week"
              onClick={() => goToWeek(weekStart.plus({ weeks: 1 }).toISODate()!)}
            >
              <ChevronRight className="size-4" />
            </Button>
            <p className="text-sm font-semibold">{rangeLabel}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToWeek(DateTime.now().setZone(timeZone).toISODate()!)}
            >
              Today
            </Button>
            <Button
              variant={view === "week" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setView("week")}
            >
              Week
            </Button>
            <Button
              variant={view === "agenda" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setView("agenda")}
            >
              Agenda
            </Button>
          </div>
        </div>

        {view === "agenda" ? (
          <div className="flex-1 overflow-auto p-4 md:p-6">
            <BookingList bookings={allBookings} viewer="teacher" timeZone={timeZone} />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="sticky top-0 z-20 grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-border bg-background">
              <div className="border-e border-border" />
              {days.map((day) => {
                const isToday = day.hasSame(now, "day");
                return (
                  <div
                    key={day.toISODate()}
                    className={cn(
                      "border-e border-border px-2 py-2 text-center last:border-e-0",
                      day.weekday === 7 && "bg-muted/40",
                    )}
                  >
                    <p
                      className={cn(
                        "text-xs font-medium",
                        isToday ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {day.toFormat("ccc")} {day.toFormat("d")}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="relative grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
              <div className="relative border-e border-border">
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="relative border-b border-border/60"
                    style={{ height: HOUR_HEIGHT }}
                  >
                    {hour > 0 ? (
                      <span className="absolute -top-2 right-2 text-[10px] text-muted-foreground">
                        {String(hour).padStart(2, "0")}:00
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>

              {days.map((day, dayIndex) => {
                const dateIso = day.toISODate()!;
                const isToday = day.hasSame(now, "day");
                const dayAvailability = availability.filter(
                  (slot) => slot.dayOfWeek === day.weekday % 7,
                );
                const dayExceptions = exceptions.filter(
                  (exception) => exception.specificDate === dateIso,
                );
                const dayBookings = bookings.filter((booking) => {
                  const start = DateTime.fromISO(booking.startsAt, { zone: timeZone });
                  return start.toISODate() === dateIso;
                });

                return (
                  <div
                    key={dateIso}
                    className={cn(
                      "relative border-e border-border last:border-e-0",
                      day.weekday === 7 && "bg-muted/20",
                    )}
                    style={{ height: HOUR_HEIGHT * HOURS.length }}
                    onPointerDown={(event) => onColumnPointerDown(event, dayIndex)}
                    onPointerMove={(event) => onColumnPointerMove(event, dayIndex)}
                    onPointerUp={(event) => onColumnPointerUp(event, dayIndex)}
                  >
                    {HOURS.map((hour) => (
                      <div
                        key={hour}
                        className="border-b border-border/60"
                        style={{ height: HOUR_HEIGHT }}
                      />
                    ))}

                    {dayAvailability.map((slot) => {
                      const top = (timeToMinutes(slot.startTime) / 60) * HOUR_HEIGHT;
                      const height =
                        ((timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime)) / 60) *
                        HOUR_HEIGHT;
                      return (
                        <div
                          key={slot.id}
                          className="pointer-events-none absolute inset-x-0 bg-primary/[0.04]"
                          style={{ top, height }}
                        />
                      );
                    })}

                    {dayExceptions.map((exception) => {
                      const top = (timeToMinutes(exception.startTime) / 60) * HOUR_HEIGHT;
                      const height =
                        ((timeToMinutes(exception.endTime) -
                          timeToMinutes(exception.startTime)) /
                          60) *
                        HOUR_HEIGHT;
                      return (
                        <button
                          key={exception.id}
                          type="button"
                          data-event
                          title="Click to remove"
                          disabled={isPending}
                          onClick={() => removeException(exception.id)}
                          className={cn(
                            "absolute inset-x-1 overflow-hidden rounded-md border px-1.5 py-1 text-start text-[11px] leading-tight",
                            exception.isBlocked
                              ? "border-amber-500/40 bg-amber-500/15 text-amber-950 dark:text-amber-100"
                              : "border-violet-500/40 bg-violet-500/15 text-violet-950 dark:text-violet-100",
                          )}
                          style={{ top, height: Math.max(height, 20) }}
                        >
                          <span className="font-medium">
                            {exception.title ??
                              (exception.isBlocked ? "Time off" : "Extra slot")}
                          </span>
                          <span className="mt-0.5 block opacity-80">
                            {exception.startTime} – {exception.endTime}
                          </span>
                        </button>
                      );
                    })}

                    {dayBookings.map((booking) => {
                      const start = DateTime.fromISO(booking.startsAt, { zone: timeZone });
                      const end = DateTime.fromISO(booking.endsAt, { zone: timeZone });
                      const top =
                        ((start.hour * 60 + start.minute) / 60) * HOUR_HEIGHT;
                      const height =
                        (end.diff(start, "minutes").minutes / 60) * HOUR_HEIGHT;
                      const pending = booking.status === "pending_teacher_confirmation";
                      const accent = booking.isFirstLesson
                        ? "border-s-emerald-500"
                        : "border-s-sky-500";

                      return (
                        <button
                          key={booking.id}
                          type="button"
                          data-event
                          onClick={() => {
                            setSelectedBooking(booking);
                            setLessonOpen(true);
                          }}
                          className={cn(
                            "absolute inset-x-1 overflow-hidden rounded-md border border-s-4 bg-card px-1.5 py-1 text-start text-[11px] leading-tight shadow-sm",
                            accent,
                            pending
                              ? "border-dashed border-border text-muted-foreground"
                              : "border-border",
                          )}
                          style={{ top, height: Math.max(height, 24) }}
                        >
                          <span className="font-medium text-foreground">
                            {start.toFormat("HH:mm")} – {end.toFormat("HH:mm")}
                          </span>
                          <span className="mt-0.5 block truncate">{booking.studentName}</span>
                        </button>
                      );
                    })}

                    {drag && drag.dayIndex === dayIndex ? (
                      <div
                        className="pointer-events-none absolute inset-x-1 rounded-md border border-dashed border-primary bg-primary/10"
                        style={{
                          top:
                            (Math.min(drag.startMinutes, drag.endMinutes) / 60) * HOUR_HEIGHT,
                          height:
                            (Math.abs(drag.endMinutes - drag.startMinutes) / 60) * HOUR_HEIGHT,
                        }}
                      />
                    ) : null}

                    {isToday ? (
                      <div
                        className="pointer-events-none absolute right-0 left-0 z-10 border-t-2 border-foreground"
                        style={{ top: (nowMinutes / 60) * HOUR_HEIGHT }}
                      >
                        <span className="absolute -top-1.5 -right-0 size-0 border-y-[6px] border-s-[8px] border-y-transparent border-s-foreground" />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <ScheduleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        students={students}
        timeZone={timeZone}
        canUseExceptions={canUseExceptions}
        prefill={prefill}
        onRescheduleConflict={(bookingId) => {
          const booking = bookings.find((item) => item.id === bookingId) ?? null;
          if (!booking) return;
          setDialogOpen(false);
          setSelectedBooking(booking);
          setLessonOpen(true);
        }}
      />

      <LessonInformationDialog
        open={lessonOpen}
        onOpenChange={setLessonOpen}
        booking={selectedBooking}
        timeZone={timeZone}
      />
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={cn("h-4 w-1 rounded-full", color)} aria-hidden />
      {label}
    </li>
  );
}
