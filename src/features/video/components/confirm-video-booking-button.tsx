"use client";

import { Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { confirmBookingAndCreateRoom } from "@/actions/video";
import { Button } from "@/components/ui/button";

export function ConfirmVideoBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await confirmBookingAndCreateRoom(bookingId);
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          toast.success("Booking confirmed and private room created.");
          router.refresh();
        })
      }
    >
      <Video className="size-4" aria-hidden />
      {isPending ? "Creating secure room…" : "Confirm and create video room"}
    </Button>
  );
}
