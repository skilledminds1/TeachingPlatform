"use client";

import { CheckCircle2, ExternalLink, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import {
  disconnectPaymentAccount,
  startPayPalConnect,
  startStripeConnect,
} from "@/actions/payment-linking";
import { Button } from "@/components/ui/button";

export function PaymentProviderCard({
  provider,
  connected,
  configured,
  maskedAccountId,
}: {
  provider: "stripe" | "paypal";
  connected: boolean;
  configured: boolean;
  maskedAccountId?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const name = provider === "stripe" ? "Stripe" : "PayPal";

  function connect(): void {
    startTransition(async () => {
      const result =
        provider === "stripe" ? await startStripeConnect() : await startPayPalConnect();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      window.location.assign(result.data.url);
    });
  }

  function disconnect(): void {
    startTransition(async () => {
      const result = await disconnectPaymentAccount(provider);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${name} disconnected.`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col justify-between gap-5 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{name}</h2>
          {connected ? (
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-500">
              <CheckCircle2 className="size-3.5" aria-hidden />
              Connected
            </span>
          ) : null}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {connected
            ? `Account ${maskedAccountId} can receive direct student payments.`
            : configured
              ? `Connect your ${name} account so students can pay you directly.`
              : `${name} is not set up on this platform yet. Ask an admin to add the API keys.`}
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
          {isPending
            ? "Opening…"
            : configured
              ? `Connect ${name}`
              : "Not configured"}
        </Button>
      )}
    </div>
  );
}
