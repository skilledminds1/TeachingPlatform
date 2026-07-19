"use client";

import { CheckCircle2, ExternalLink, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  disconnectPaymentAccount,
  linkPayFastMerchant,
  startPayPalConnect,
} from "@/actions/payment-linking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Provider = "paypal" | "payfast";

export function PaymentProviderCard({
  provider,
  connected,
  configured,
  maskedAccountId,
  onboardingStatus,
  settlementCurrency,
  country,
}: {
  provider: Provider;
  connected: boolean;
  configured: boolean;
  maskedAccountId?: string;
  onboardingStatus?: string;
  settlementCurrency?: string | null;
  country?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [merchantId, setMerchantId] = useState("");
  const name = provider === "paypal" ? "PayPal" : "PayFast";

  function connect(): void {
    startTransition(async () => {
      if (provider === "payfast") {
        const result = await linkPayFastMerchant({ merchantId });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success("PayFast merchant linked.");
        router.refresh();
        return;
      }
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
      const result = await disconnectPaymentAccount(provider);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${name} disconnected.`);
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
          <h2 className="font-semibold">{name}</h2>
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
              ? provider === "payfast"
                ? "Enter your PayFast merchant ID so ZAR students can pay you (Apple Pay / Google Pay appear on PayFast when enabled)."
                : `Connect your ${name} account so students can pay you directly.`
              : `${name} is not enabled on this platform yet. Ask an admin to add credentials and turn on the lesson-payment flag.`}
        </p>
        {!connected && provider === "payfast" && configured ? (
          <Input
            className="mt-3"
            inputMode="numeric"
            placeholder="PayFast merchant ID"
            value={merchantId}
            onChange={(event) => setMerchantId(event.target.value)}
            aria-label="PayFast merchant ID"
          />
        ) : null}
      </div>
      {connected ? (
        <Button variant="outline" onClick={disconnect} disabled={isPending}>
          <Unplug className="size-4" aria-hidden />
          {isPending ? "Disconnecting…" : "Disconnect"}
        </Button>
      ) : (
        <Button
          onClick={connect}
          disabled={
            isPending || !configured || (provider === "payfast" && merchantId.trim().length < 6)
          }
        >
          <ExternalLink className="size-4" aria-hidden />
          {isPending
            ? "Saving…"
            : configured
              ? provider === "payfast"
                ? "Link PayFast"
                : `Connect ${name}`
              : "Not configured"}
        </Button>
      )}
    </div>
  );
}
