"use client";

import { CheckCircle2, ExternalLink, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import {
  disconnectPaymentAccount,
  startPayPalConnect,
} from "@/actions/payment-linking";
import { Button } from "@/components/ui/button";

export function PaymentProviderCard({
  connected,
  configured,
  maskedAccountId,
  onboardingStatus,
  settlementCurrency,
  country,
}: {
  connected: boolean;
  configured: boolean;
  maskedAccountId?: string;
  onboardingStatus?: string;
  settlementCurrency?: string | null;
  country?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function connect(): void {
    startTransition(async () => {
      const result = await startPayPalConnect();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      window.location.assign(result.data.url);
    });
  }

  function disconnect(): void {
    startTransition(async () => {
      const result = await disconnectPaymentAccount("paypal");
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("PayPal disconnected.");
      router.refresh();
    });
  }

  const statusLabel =
    onboardingStatus === "pending"
      ? "Onboarding pending"
      : onboardingStatus === "restricted"
        ? "Restricted"
        : connected
          ? "Ready"
          : null;

  return (
    <div className="flex flex-col justify-between gap-5 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">PayPal</h2>
          {statusLabel ? (
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-500">
              <CheckCircle2 className="size-3.5" aria-hidden />
              {statusLabel}
            </span>
          ) : null}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {connected
            ? `Account ${maskedAccountId} can receive student lesson payments${
                settlementCurrency ? ` in ${settlementCurrency}` : ""
              }${country ? ` (${country})` : ""}.`
            : configured
              ? "Connect your PayPal account so students can pay you directly for lessons."
              : "PayPal is not enabled on this platform yet. Ask an admin to add credentials and turn on the lesson-payment flag."}
        </p>
      </div>
      {connected ? (
        <Button variant="outline" onClick={disconnect} disabled={isPending}>
          <Unplug className="size-4" aria-hidden />
          {isPending ? "Disconnecting…" : "Disconnect"}
        </Button>
      ) : (
        <Button onClick={connect} disabled={isPending || !configured}>
          <ExternalLink className="size-4" aria-hidden />
          {isPending ? "Connecting…" : configured ? "Connect PayPal" : "Not configured"}
        </Button>
      )}
    </div>
  );
}
