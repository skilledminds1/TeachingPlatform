"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { startLessonCheckout } from "@/actions/payments";
import { Button } from "@/components/ui/button";

export function BookingCheckoutButtons({
  bookingId,
  providers,
  currency,
  currencySupported,
}: {
  bookingId: string;
  providers: Array<"paypal">;
  /** The booking's settlement currency, for the unsupported-currency message. */
  currency: string;
  currencySupported: boolean;
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
    // INT-08: distinguish "teacher hasn't linked an account" from "this currency has no
    // rail at all". Bookings priced in ZAR predate its removal — PayPal never supported it,
    // so those checkouts always failed — and telling the student to wait for the teacher to
    // finish linking would send them somewhere that can never resolve.
    return (
      <p className="text-sm text-muted-foreground">
        {currencySupported
          ? "This teacher has not finished linking a payment account for your lesson currency yet."
          : `Lessons priced in ${currency} cannot be paid for online. Please contact your teacher to agree a supported currency.`}
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
