"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { startLessonCheckout } from "@/actions/payments";
import { Button } from "@/components/ui/button";

const labels = {
  payfast: "Pay with PayFast",
  paypal: "Pay with PayPal",
} as const;

export function BookingCheckoutButtons({
  bookingId,
  providers,
}: {
  bookingId: string;
  providers: Array<"payfast" | "paypal">;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function pay(provider: "payfast" | "paypal"): void {
    startTransition(async () => {
      const result = await startLessonCheckout({ bookingId, provider });
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      if (result.data.method === "post" && result.data.fields) {
        const form = document.createElement("form");
        form.method = "POST";
        form.action = result.data.url;
        for (const [key, value] of Object.entries(result.data.fields)) {
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = key;
          input.value = value;
          form.appendChild(input);
        }
        document.body.appendChild(form);
        form.submit();
        return;
      }

      window.location.assign(result.data.url);
      router.refresh();
    });
  }

  if (providers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This teacher has not finished linking a payment account for your lesson currency yet.
      </p>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {providers.map((provider) => (
        <Button
          key={provider}
          type="button"
          onClick={() => pay(provider)}
          disabled={isPending}
        >
          {isPending ? "Starting checkout…" : labels[provider]}
        </Button>
      ))}
      {providers.includes("payfast") ? (
        <p className="basis-full text-xs text-muted-foreground">
          PayFast checkout may also offer Apple Pay and Google Pay when enabled for the merchant.
        </p>
      ) : null}
    </div>
  );
}
