"use client";

import { Video, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { confirmBookingAndCreateRoom, declineBooking } from "@/actions/video";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * The teacher's answer to a booking request — the transition that confirms a lesson.
 *
 * Accepting provisions the LiveKit room, so the student never waits on a payment the platform
 * cannot see. Declining releases the slot immediately rather than letting it sit held until
 * the 72-hour window runs out.
 */
export function ConfirmVideoBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showDecline, setShowDecline] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await confirmBookingAndCreateRoom(bookingId);
              if (!result.success) {
                toast.error(result.error);
                return;
              }
              toast.success("Lesson confirmed. The video room is ready.");
              router.refresh();
            })
          }
        >
          <Video className="size-4" aria-hidden />
          {isPending ? "Confirming…" : "Accept this lesson"}
        </Button>
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() => setShowDecline((open) => !open)}
        >
          <X className="size-4" aria-hidden />
          Decline
        </Button>
      </div>

      {showDecline ? (
        <div className="space-y-2">
          <label htmlFor="decline-reason" className="text-sm font-medium">
            Why can&apos;t you take this lesson?
          </label>
          <Textarea
            id="decline-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="The student sees this, so a short explanation helps them rebook."
            rows={3}
          />
          <Button
            variant="destructive"
            disabled={isPending || reason.trim().length < 5}
            onClick={() =>
              startTransition(async () => {
                const result = await declineBooking(bookingId, reason);
                if (!result.success) {
                  toast.error(result.error);
                  return;
                }
                toast.success("Lesson declined and the slot released.");
                setShowDecline(false);
                setReason("");
                router.refresh();
              })
            }
          >
            {isPending ? "Declining…" : "Confirm decline"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
