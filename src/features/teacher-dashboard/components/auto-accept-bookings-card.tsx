"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { setAutoAcceptBookings } from "@/actions/booking-preferences";
import { Checkbox } from "@/components/ui/checkbox";

export function AutoAcceptBookingsCard({ enabled }: { enabled: boolean }) {
  const [checked, setChecked] = useState(enabled);
  const [isPending, startTransition] = useTransition();

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-6">
      <div>
        <h2 className="font-heading text-2xl font-semibold tracking-tight">Booking requests</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A student&apos;s request holds your slot for 72 hours while it waits for your answer.
          If you don&apos;t answer, the slot is released and the student is told.
        </p>
      </div>

      <div className="flex items-start gap-3">
        <Checkbox
          id="auto-accept-bookings"
          checked={checked}
          disabled={isPending}
          onCheckedChange={(next) => {
            const value = next === true;
            const previous = checked;
            setChecked(value);
            startTransition(async () => {
              const result = await setAutoAcceptBookings({ enabled: value });
              if (!result.success) {
                setChecked(previous);
                toast.error(result.error);
                return;
              }
              toast.success(
                value
                  ? "Booking requests will be accepted automatically."
                  : "You'll confirm each booking request yourself.",
              );
            });
          }}
        />
        <div className="space-y-1">
          <label htmlFor="auto-accept-bookings" className="text-sm font-medium">
            Accept booking requests automatically
          </label>
          <p className="text-sm text-muted-foreground">
            The lesson is confirmed and the video room opens the moment a student books, with no
            wait for you. Only turn this on if every slot you publish is one you can definitely
            teach — you are committing to the lesson in advance.
          </p>
        </div>
      </div>
    </section>
  );
}
