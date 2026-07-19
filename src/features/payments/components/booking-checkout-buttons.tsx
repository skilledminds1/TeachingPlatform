"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { startLessonCheckout } from "@/actions/payments";
import { Button } from "@/components/ui/button";

export function BookingCheckoutButtons({
  bookingId,
  providers,
}: {
  bookingId: string;
  providers: Array<"paypal">;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function pay(): void {
    startTransition(async () => {
      const result = await startLessonCheckout({ bookingId, provider: "paypal" });
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      window.location.assign(result.data.url);
      router.refresh();
    });
  }

  if (providers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This teacher has not finished linking a PayPal account for your lesson currency yet.
      </p>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Button type="button" onClick={pay} disabled={isPending}>
        {isPending ? "Starting checkout…" : "Pay with PayPal"}
      </Button>
    </div>
  );
}
