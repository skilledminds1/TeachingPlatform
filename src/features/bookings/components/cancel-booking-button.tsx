"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { cancelBooking } from "@/actions/bookings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Cancel booking
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
      <p className="text-sm font-medium">Why are you cancelling?</p>
      <Input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Brief reason"
        maxLength={500}
      />
      <p className="text-xs text-muted-foreground">
        Cancellations within 24 hours may be subject to the teacher&apos;s refund policy once
        payments are enabled.
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="destructive"
          disabled={isPending || reason.trim().length < 3}
          onClick={() =>
            startTransition(async () => {
              const result = await cancelBooking({ bookingId, reason });
              if (!result.success) {
                toast.error(result.error);
                return;
              }
              toast.success("Booking cancelled.");
              router.refresh();
            })
          }
        >
          {isPending ? "Cancelling…" : "Confirm cancellation"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Keep booking
        </Button>
      </div>
    </div>
  );
}
