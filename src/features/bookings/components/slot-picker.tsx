"use client";

import { CalendarDays, Clock3 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { createBooking } from "@/actions/bookings";
import { Button } from "@/components/ui/button";
import { dateKeyInZone, formatDayLabel, formatTime } from "@/lib/format";
import { useBrowserTimeZone } from "@/hooks/use-browser-timezone";

type Slot = { startsAt: string; endsAt: string; date: string };

export function SlotPicker({
  teacherSlug,
  slots,
  teacherTimeZone,
  viewerTimeZone: serverTimeZone,
  signedIn,
}: {
  teacherSlug: string;
  slots: Slot[];
  teacherTimeZone: string;
  /** Server-rendered fallback; the browser zone takes over after hydration. */
  viewerTimeZone: string;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // INT-06: anonymous visitors have no stored zone, and the page previously fell back to
  // Africa/Johannesburg — showing a prospective student times that were hours wrong at the
  // very top of the acquisition funnel. Detect the browser's zone and prefer it.
  const viewerTimeZone = useBrowserTimeZone(serverTimeZone);
  // INT-05: group by the VIEWER's calendar date, not the teacher's.
  //
  // `slot.date` is computed server-side in the TEACHER's zone, but the tab label was
  // rendered by formatting the first slot's instant in the VIEWER's zone. For anyone offset
  // far enough, one teacher-day spans two viewer-days: a tab reading "Sun, 09 Aug" could
  // contain slots that are actually Monday for the viewer, adjacent tabs could render the
  // same label, and the slot buttons showed a bare time with no date to contradict it. A
  // student could book a lesson a day away from the one they meant.
  const dates = useMemo(() => {
    const keys = slots.map((slot) => dateKeyInZone(slot.startsAt, viewerTimeZone));
    return [...new Set(keys)].sort().slice(0, 7);
  }, [slots, viewerTimeZone]);

  const [chosenDate, setChosenDate] = useState<string | null>(null);

  // Derive the active tab rather than storing and correcting it. The day list changes when
  // the browser zone resolves after hydration, and again if slots are refetched — deriving
  // means it can never point at a day that no longer exists, without an effect that writes
  // state during render.
  const activeDate = chosenDate && dates.includes(chosenDate) ? chosenDate : (dates[0] ?? "");

  const daySlots = useMemo(
    () =>
      slots.filter((slot) => dateKeyInZone(slot.startsAt, viewerTimeZone) === activeDate),
    [slots, viewerTimeZone, activeDate],
  );

  function reserve(): void {
    if (!selected) return;
    startTransition(async () => {
      const result = await createBooking({ teacherSlug, startsAt: selected });
      if (!result.success) {
        toast.error(result.error);
        router.refresh();
        return;
      }
      router.push(`/dashboard/bookings/${result.data.bookingId}`);
    });
  }

  if (slots.length === 0) {
    return (
      <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
        No open slots in the next two weeks. Check back soon.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {dates.map((date) => {
          const firstSlot = slots.find(
            (slot) => dateKeyInZone(slot.startsAt, viewerTimeZone) === date,
          )!;
          return (
            <Button
              key={date}
              size="sm"
              variant={activeDate === date ? "default" : "outline"}
              onClick={() => {
                setChosenDate(date);
                setSelected(null);
              }}
            >
              {formatDayLabel(firstSlot.startsAt, viewerTimeZone)}
            </Button>
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {daySlots.map((slot) => (
          <Button
            key={slot.startsAt}
            size="sm"
            variant={selected === slot.startsAt ? "default" : "outline"}
            onClick={() => setSelected(slot.startsAt)}
          >
            {formatTime(slot.startsAt, viewerTimeZone)}
          </Button>
        ))}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock3 className="size-3.5" aria-hidden />
        Times shown in {viewerTimeZone}. Teacher schedule: {teacherTimeZone}.
      </p>
      {signedIn ? (
        <Button className="w-full" onClick={reserve} disabled={!selected || isPending}>
          <CalendarDays className="size-4" aria-hidden />
          {isPending ? "Reserving…" : "Reserve selected time"}
        </Button>
      ) : (
        <Button
          className="w-full"
          render={<Link href={`/login?redirect=/find-tutor/${teacherSlug}`} />}
        >
          Sign in to book
        </Button>
      )}
    </div>
  );
}
