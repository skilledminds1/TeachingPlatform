"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import {
  acceptBookingReschedule,
  declineBookingReschedule,
} from "@/actions/bookings";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";

export function RescheduleResponseCard({
  proposalId,
  currentStartsAt,
  proposedStartsAt,
  timeZone,
  viewer,
}: {
  proposalId: string;
  currentStartsAt: string | Date;
  proposedStartsAt: string | Date;
  timeZone: string;
  viewer: "teacher" | "student";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <section className="rounded-xl border border-primary/30 bg-primary/5 p-5">
      <p className="font-medium">
        {viewer === "student" ? "Reschedule requested" : "Awaiting student approval"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Current: {formatDateTime(currentStartsAt, timeZone)}
      </p>
      <p className="text-sm text-muted-foreground">
        Proposed: {formatDateTime(proposedStartsAt, timeZone)}
      </p>

      {viewer === "student" ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await acceptBookingReschedule({ proposalId });
                if (!result.success) {
                  toast.error(result.error);
                  return;
                }
                toast.success("New lesson time accepted.");
                router.refresh();
              })
            }
          >
            {isPending ? "Saving…" : "Accept new time"}
          </Button>
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await declineBookingReschedule({ proposalId });
                if (!result.success) {
                  toast.error(result.error);
                  return;
                }
                toast.success("Reschedule declined. Original time kept.");
                router.refresh();
              })
            }
          >
            Decline
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          The lesson stays at the original time until the student accepts.
        </p>
      )}
    </section>
  );
}
