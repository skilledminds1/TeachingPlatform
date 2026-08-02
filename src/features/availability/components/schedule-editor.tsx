"use client";

import { Globe, Plus, Save, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  addAvailabilityException,
  deleteAvailabilityException,
  saveWeeklyAvailability,
} from "@/actions/availability";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Slot = { dayOfWeek: number; startTime: string; endTime: string };
type Exception = Slot & {
  id: string;
  specificDate: string;
  isBlocked: boolean;
};

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function ScheduleEditor({
  initialSlots,
  initialExceptions,
  timeZone,
  timeZoneLabel,
  timeZoneIsLegacyDefault,
}: {
  initialSlots: Slot[];
  initialExceptions: Exception[];
  timeZone: string;
  timeZoneLabel: string;
  timeZoneIsLegacyDefault: boolean;
}) {
  const [slots, setSlots] = useState(initialSlots);
  const [exceptions, setExceptions] = useState(initialExceptions);
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [isBlocked, setIsBlocked] = useState(true);
  const [isPending, startTransition] = useTransition();

  function addSlot(dayOfWeek: number): void {
    setSlots((current) => [...current, { dayOfWeek, startTime: "09:00", endTime: "17:00" }]);
  }

  function save(): void {
    startTransition(async () => {
      const result = await saveWeeklyAvailability({ slots });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`Saved ${result.data.saved} weekly availability windows.`);
    });
  }

  function addException(): void {
    startTransition(async () => {
      const result = await addAvailabilityException({
        specificDate: date,
        startTime,
        endTime,
        isBlocked,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setExceptions((current) => [
        ...current,
        { id: result.data.id, specificDate: date, startTime, endTime, isBlocked, dayOfWeek: 0 },
      ]);
      setDate("");
      toast.success(isBlocked ? "Blocked time added." : "Extra hours added.");
      // INT-14: a clock change made this time either impossible or ambiguous, and it was
      // resolved silently. Say so rather than letting the teacher discover the shifted hour
      // when a student books it.
      for (const warning of result.data.warnings) {
        toast.warning(warning, { duration: 10_000 });
      }
    });
  }

  function removeException(id: string): void {
    startTransition(async () => {
      const result = await deleteAvailabilityException(id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setExceptions((current) => current.filter((item) => item.id !== id));
      toast.success("Exception removed.");
    });
  }

  return (
    <div className="space-y-6">
      {/*
        INT-14: the zone was a muted footnote under one heading, and it defaulted to SAST.
        A teacher in London who clicked through onboarding published 09:00-17:00 South
        African time — off by one to eight hours — and every slot, reminder and calendar
        invite downstream inherited it. State the clock before they set hours on it.
      */}
      <section
        className={
          timeZoneIsLegacyDefault
            ? "rounded-xl border border-amber-500/50 bg-amber-500/10 px-5 py-4 shadow-sm"
            : "rounded-xl border border-border bg-card px-5 py-4 shadow-sm"
        }
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex gap-3">
            {timeZoneIsLegacyDefault ? (
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
            ) : (
              <Globe className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <div>
              <p className="text-sm font-medium">
                All times below are in {timeZoneLabel}
              </p>
              {timeZoneIsLegacyDefault ? (
                <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                  That is the account default, not a zone you picked. If you do not teach on
                  South African time, change it before saving — your lesson slots, reminders
                  and calendar invites are all generated from it.
                </p>
              ) : (
                <p className="mt-1 max-w-prose text-xs text-muted-foreground">
                  Students see these hours converted to their own zone.
                </p>
              )}
            </div>
          </div>
          <Link
            href="/dashboard/settings"
            className="shrink-0 rounded-lg border border-input px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            Change timezone
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold">Weekly hours</h2>
            <p className="text-xs text-muted-foreground">All times use {timeZone}.</p>
          </div>
          <Button onClick={save} disabled={isPending}>
            <Save className="size-4" aria-hidden />
            {isPending ? "Saving…" : "Save schedule"}
          </Button>
        </div>
        <div className="divide-y divide-border">
          {days.map((day, dayOfWeek) => {
            const daySlots = slots
              .map((slot, index) => ({ slot, index }))
              .filter(({ slot }) => slot.dayOfWeek === dayOfWeek);
            return (
              <div key={day} className="grid gap-3 px-5 py-4 sm:grid-cols-[120px_1fr]">
                <div className="pt-2 text-sm font-medium">{day}</div>
                <div className="space-y-2">
                  {daySlots.map(({ slot, index }) => (
                    <div key={`${day}-${index}`} className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={slot.startTime}
                        aria-label={`${day} start time`}
                        onChange={(event) =>
                          setSlots((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, startTime: event.target.value } : item,
                            ),
                          )
                        }
                      />
                      <span className="text-sm text-muted-foreground">to</span>
                      <Input
                        type="time"
                        value={slot.endTime}
                        aria-label={`${day} end time`}
                        onChange={(event) =>
                          setSlots((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, endTime: event.target.value } : item,
                            ),
                          )
                        }
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Remove ${day} hours`}
                        onClick={() =>
                          setSlots((current) => current.filter((_, itemIndex) => itemIndex !== index))
                        }
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => addSlot(dayOfWeek)}>
                    <Plus className="size-3.5" aria-hidden />
                    Add hours
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="font-semibold">Date exceptions</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Block time off or add extra hours on Starter and higher plans.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-5">
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <Input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
          <Input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
          <select
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            value={isBlocked ? "blocked" : "extra"}
            onChange={(event) => setIsBlocked(event.target.value === "blocked")}
          >
            <option value="blocked">Block time</option>
            <option value="extra">Add hours</option>
          </select>
          <Button onClick={addException} disabled={isPending || !date}>
            <Plus className="size-4" aria-hidden />
            Add
          </Button>
        </div>

        {exceptions.length > 0 ? (
          <ul className="mt-5 divide-y divide-border rounded-lg border border-border">
            {exceptions.map((exception) => (
              <li
                key={exception.id}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div>
                  <span className="font-medium">{exception.specificDate}</span>
                  <span className="ml-2 text-muted-foreground">
                    {exception.startTime}–{exception.endTime} ·{" "}
                    {exception.isBlocked ? "Blocked" : "Extra hours"}
                  </span>
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Remove exception"
                  onClick={() => removeException(exception.id)}
                  disabled={isPending}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
