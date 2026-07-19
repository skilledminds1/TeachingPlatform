"use client";

import { CalendarDays, RefreshCw, UserRound } from "lucide-react";
import { DateTime } from "luxon";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { addAvailabilityExceptionRange } from "@/actions/availability";
import { scheduleLessonAsTeacher } from "@/actions/bookings";
import { startConversationWithStudent } from "@/actions/messaging";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LessonConflict } from "@/server/availability/conflicts";
import type { CalendarStudentOption } from "@/server/bookings/calendar";

export type ScheduleTab = "lesson" | "time-off" | "extra-slots";

export type SchedulePrefill = {
  tab?: ScheduleTab;
  date?: string;
  startTime?: string;
  endTime?: string;
};

const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = index % 2 === 0 ? "00" : "30";
  return `${String(hour).padStart(2, "0")}:${minute}`;
});

function nextHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) + 60;
  const wrapped = total % (24 * 60);
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}

export function ScheduleDialog({
  open,
  onOpenChange,
  students,
  timeZone,
  canUseExceptions,
  prefill,
  onRescheduleConflict,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: CalendarStudentOption[];
  timeZone: string;
  canUseExceptions: boolean;
  prefill: SchedulePrefill | null;
  onRescheduleConflict?: (bookingId: string) => void;
}) {
  const formKey = open
    ? `${prefill?.tab ?? "lesson"}-${prefill?.date ?? ""}-${prefill?.startTime ?? ""}-${prefill?.endTime ?? ""}`
    : "closed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader>
          <DialogTitle>Schedule</DialogTitle>
        </DialogHeader>
        {open ? (
          <ScheduleForm
            key={formKey}
            students={students}
            timeZone={timeZone}
            canUseExceptions={canUseExceptions}
            prefill={prefill}
            onClose={() => onOpenChange(false)}
            onRescheduleConflict={onRescheduleConflict}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ScheduleForm({
  students,
  timeZone,
  canUseExceptions,
  prefill,
  onClose,
  onRescheduleConflict,
}: {
  students: CalendarStudentOption[];
  timeZone: string;
  canUseExceptions: boolean;
  prefill: SchedulePrefill | null;
  onClose: () => void;
  onRescheduleConflict?: (bookingId: string) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const today = DateTime.now().setZone(timeZone).toISODate()!;
  const initialDate = prefill?.date ?? today;
  const initialStart = prefill?.startTime ?? "10:00";
  const initialEnd = prefill?.endTime ?? nextHour(initialStart);

  const [tab, setTab] = useState<ScheduleTab>(prefill?.tab ?? "lesson");
  const [studentId, setStudentId] = useState(students[0]?.studentId ?? "");
  const [lessonDate, setLessonDate] = useState(initialDate);
  const [lessonTime, setLessonTime] = useState(initialStart);
  const [timeOffTitle, setTimeOffTitle] = useState("Busy");
  const [allDay, setAllDay] = useState(false);
  const [startDate, setStartDate] = useState(initialDate);
  const [startTime, setStartTime] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialDate);
  const [endTime, setEndTime] = useState(initialEnd);
  const [conflicts, setConflicts] = useState<LessonConflict[]>([]);

  const pastExtraSlot = useMemo(() => {
    const start = DateTime.fromISO(`${startDate}T${startTime}`, { zone: timeZone });
    return start.isValid && start < DateTime.now().setZone(timeZone);
  }, [startDate, startTime, timeZone]);

  function submitLesson(): void {
    if (!studentId) {
      toast.error("Add a student before scheduling a lesson.");
      return;
    }
    const startsAt = DateTime.fromISO(`${lessonDate}T${lessonTime}`, {
      zone: timeZone,
    });
    if (!startsAt.isValid) {
      toast.error("Choose a valid date and time.");
      return;
    }
    if (startsAt < DateTime.now().setZone(timeZone)) {
      toast.error("You can't schedule a lesson in the past.");
      return;
    }

    startTransition(async () => {
      const result = await scheduleLessonAsTeacher({
        studentId,
        startsAt: startsAt.toUTC().toISO()!,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Lesson scheduled. The student was notified to pay.");
      onClose();
      router.refresh();
    });
  }

  function submitException(isBlocked: boolean): void {
    if (!canUseExceptions) {
      toast.error("Blocked dates and extra hours are available on Starter and above.");
      return;
    }
    if (!isBlocked && pastExtraSlot) {
      toast.error("You can't create a time slot in the past.");
      return;
    }

    startTransition(async () => {
      const result = await addAvailabilityExceptionRange({
        startDate,
        startTime: allDay && isBlocked ? "00:00" : startTime,
        endDate,
        endTime: allDay && isBlocked ? "23:59" : endTime,
        isBlocked,
        title: isBlocked ? timeOffTitle : undefined,
        allDay: isBlocked ? allDay : false,
      });
      if (!result.success) {
        const details = result.details as { conflicts?: LessonConflict[] } | undefined;
        if (result.code === "CONFLICT" && details?.conflicts?.length) {
          setConflicts(details.conflicts);
          return;
        }
        toast.error(result.error);
        return;
      }
      setConflicts([]);
      toast.success(isBlocked ? "Time off booked." : "Extra slots added.");
      onClose();
      router.refresh();
    });
  }

  function messageConflictStudent(studentId: string): void {
    startTransition(async () => {
      const result = await startConversationWithStudent(studentId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      onClose();
      router.push(`/dashboard/messages/${result.data.conversationId}`);
    });
  }

  return (
    <>
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as ScheduleTab)}
        className="gap-0"
      >
        <TabsList>
          <TabsTrigger value="lesson">Lesson</TabsTrigger>
          <TabsTrigger value="time-off">Time off</TabsTrigger>
          <TabsTrigger value="extra-slots">Extra slots</TabsTrigger>
        </TabsList>

        <TabsContent value="lesson" className="space-y-5 px-5 py-5">
          <Field>
            <FieldLabel htmlFor="schedule-student">Student</FieldLabel>
            {students.length > 0 ? (
              <div className="relative">
                <UserRound
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Select
                  id="schedule-student"
                  className="pl-9"
                  value={studentId}
                  onChange={(event) => setStudentId(event.target.value)}
                >
                  {students.map((student) => (
                    <option key={student.studentId} value={student.studentId}>
                      {student.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                No students yet. Students appear here after their first booking with you.
              </p>
            )}
          </Field>

          <div className="space-y-2">
            <p className="text-sm font-medium">Lesson type</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                className="flex items-center gap-3 rounded-xl border-2 border-foreground px-3 py-3 text-left"
              >
                <CalendarDays className="size-4 shrink-0" aria-hidden />
                <span className="flex-1 text-sm font-medium">Single</span>
                <span className="size-4 rounded-full border-4 border-foreground" />
              </button>
              <button
                type="button"
                disabled
                title="Weekly lessons coming soon"
                className="flex items-center gap-3 rounded-xl border border-border px-3 py-3 text-left opacity-50"
              >
                <RefreshCw className="size-4 shrink-0" aria-hidden />
                <span className="flex-1 text-sm font-medium">Weekly</span>
                <span className="size-4 rounded-full border border-border" />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Date and time</p>
            <Select value="60" disabled>
              <option value="60">1 hour</option>
            </Select>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <Select value={lessonDate} onChange={(event) => setLessonDate(event.target.value)}>
                {dateOptions(today, 60).map((date) => (
                  <option key={date.value} value={date.value}>
                    {date.label}
                  </option>
                ))}
              </Select>
              <span className="text-muted-foreground" aria-hidden>
                →
              </span>
              <Select value={lessonTime} onChange={(event) => setLessonTime(event.target.value)}>
                {TIME_OPTIONS.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="time-off" className="space-y-5 px-5 py-5">
          <Field>
            <FieldLabel htmlFor="time-off-title">Title</FieldLabel>
            <Input
              id="time-off-title"
              value={timeOffTitle}
              onChange={(event) => setTimeOffTitle(event.target.value)}
            />
            <FieldDescription>Visible only to you</FieldDescription>
          </Field>

          <DateTimeRangeFields
            startDate={startDate}
            startTime={startTime}
            endDate={endDate}
            endTime={endTime}
            today={today}
            disabledTimes={allDay}
            onStartDate={setStartDate}
            onStartTime={setStartTime}
            onEndDate={setEndDate}
            onEndTime={setEndTime}
          />

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={allDay}
              onCheckedChange={(checked) => setAllDay(checked === true)}
            />
            All day
          </label>

            {!canUseExceptions ? (
              <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
                Time off requires Starter or above.{" "}
                <a href="/dashboard/teacher/billing" className="font-medium text-foreground underline">
                  Upgrade plan
                </a>
              </p>
            ) : null}

            {conflicts.length > 0 ? (
              <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                <p className="text-sm font-medium">
                  You have lessons booked during this time. Message students to reschedule before
                  saving time off.
                </p>
                <ul className="space-y-2">
                  {conflicts.map((conflict) => (
                    <li
                      key={conflict.bookingId}
                      className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
                    >
                      <p className="font-medium">{conflict.studentName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(conflict.startsAt, timeZone)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() => messageConflictStudent(conflict.studentId)}
                        >
                          Message
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => onRescheduleConflict?.(conflict.bookingId)}
                        >
                          Reschedule
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </TabsContent>

        <TabsContent value="extra-slots" className="space-y-5 px-5 py-5">
          <div>
            <h3 className="font-semibold">Add extra slots</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose time slots up to 24 hours long.
            </p>
          </div>

          <DateTimeRangeFields
            startDate={startDate}
            startTime={startTime}
            endDate={endDate}
            endTime={endTime}
            today={today}
            onStartDate={setStartDate}
            onStartTime={setStartTime}
            onEndDate={setEndDate}
            onEndTime={setEndTime}
          />

          {pastExtraSlot ? (
            <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
                !
              </span>
              You can&apos;t create a time slot in the past
            </div>
          ) : null}

          {!canUseExceptions ? (
            <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
              Extra slots require Starter or above.{" "}
              <a href="/dashboard/teacher/billing" className="font-medium text-foreground underline">
                Upgrade plan
              </a>
            </p>
          ) : null}
        </TabsContent>
      </Tabs>

      <DialogFooter>
        {tab === "lesson" ? (
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={isPending || students.length === 0}
            onClick={submitLesson}
          >
            {isPending ? "Scheduling…" : "Schedule lesson"}
          </Button>
        ) : null}
          {tab === "time-off" ? (
            <Button
              type="button"
              size="lg"
              className="w-full"
              disabled={isPending || !canUseExceptions}
              onClick={() => {
                setConflicts([]);
                submitException(true);
              }}
            >
              {isPending ? "Saving…" : "Book time off"}
            </Button>
          ) : null}
        {tab === "extra-slots" ? (
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={isPending || !canUseExceptions || pastExtraSlot}
            onClick={() => submitException(false)}
          >
            {isPending ? "Saving…" : "Add"}
          </Button>
        ) : null}
      </DialogFooter>
    </>
  );
}

function dateOptions(today: string, days: number) {
  const start = DateTime.fromISO(today);
  return Array.from({ length: days }, (_, index) => {
    const date = start.plus({ days: index });
    return {
      value: date.toISODate()!,
      label: date.toFormat("ccc, LLL d"),
    };
  });
}

function DateTimeRangeFields({
  startDate,
  startTime,
  endDate,
  endTime,
  today,
  disabledTimes,
  onStartDate,
  onStartTime,
  onEndDate,
  onEndTime,
}: {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  today: string;
  disabledTimes?: boolean;
  onStartDate: (value: string) => void;
  onStartTime: (value: string) => void;
  onEndDate: (value: string) => void;
  onEndTime: (value: string) => void;
}) {
  const options = dateOptions(today, 60);
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">Starts</p>
        <div className={cn("grid gap-2", disabledTimes ? "grid-cols-1" : "grid-cols-2")}>
          <Select value={startDate} onChange={(event) => onStartDate(event.target.value)}>
            {options.map((date) => (
              <option key={date.value} value={date.value}>
                {date.label}
              </option>
            ))}
          </Select>
          {!disabledTimes ? (
            <Select value={startTime} onChange={(event) => onStartTime(event.target.value)}>
              {TIME_OPTIONS.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </Select>
          ) : null}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Ends</p>
        <div className={cn("grid gap-2", disabledTimes ? "grid-cols-1" : "grid-cols-2")}>
          <Select value={endDate} onChange={(event) => onEndDate(event.target.value)}>
            {options.map((date) => (
              <option key={date.value} value={date.value}>
                {date.label}
              </option>
            ))}
          </Select>
          {!disabledTimes ? (
            <Select value={endTime} onChange={(event) => onEndTime(event.target.value)}>
              {TIME_OPTIONS.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </Select>
          ) : null}
        </div>
      </div>
    </div>
  );
}
