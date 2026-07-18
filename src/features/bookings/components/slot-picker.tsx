"use client";

import { CalendarDays, Clock3 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createBooking } from "@/actions/bookings";
import { Button } from "@/components/ui/button";

type Slot = { startsAt: string; endsAt: string; date: string };

export function SlotPicker({
  teacherSlug,
  slots,
  teacherTimeZone,
  viewerTimeZone,
  signedIn,
}: {
  teacherSlug: string;
  slots: Slot[];
  teacherTimeZone: string;
  viewerTimeZone: string;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const dates = [...new Set(slots.map((slot) => slot.date))].slice(0, 7);
  const [activeDate, setActiveDate] = useState(dates[0] ?? "");
  const daySlots = slots.filter((slot) => slot.date === activeDate);

  function display(value: string, options: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat("en-ZA", {
      timeZone: viewerTimeZone,
      ...options,
    }).format(new Date(value));
  }

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
          const firstSlot = slots.find((slot) => slot.date === date)!;
          return (
            <Button
              key={date}
              size="sm"
              variant={activeDate === date ? "default" : "outline"}
              onClick={() => {
                setActiveDate(date);
                setSelected(null);
              }}
            >
              {display(firstSlot.startsAt, { weekday: "short", day: "numeric", month: "short" })}
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
            {display(slot.startsAt, { hour: "2-digit", minute: "2-digit" })}
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
          render={<Link href={`/login?redirect=/teachers/${teacherSlug}`} />}
        >
          Sign in to book
        </Button>
      )}
    </div>
  );
}
