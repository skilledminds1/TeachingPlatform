"use client";

import { ExternalLink, ShieldCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { removeMyPaymentLink, saveMyPaymentLink } from "@/actions/payment-links";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PaymentLinkProvider } from "@/lib/payments/payment-links";

export function PaymentLinkEditor({
  currentUrl,
  currentHost,
  pendingHost,
  providers,
}: {
  currentUrl: string | null;
  currentHost: string | null;
  pendingHost: string | null;
  providers: readonly PaymentLinkProvider[];
}) {
  const [url, setUrl] = useState(currentUrl ?? "");
  const [isPending, startTransition] = useTransition();

  return (
    <section className="space-y-5 rounded-xl border border-border bg-card p-6">
      <div>
        <h2 className="font-heading text-xl font-semibold tracking-tight">
          How students pay you
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste a payment link from your own provider. Students go straight there and pay you
          directly — Amazing Skills never touches the money, and takes no cut of your lesson.
        </p>
      </div>

      {currentHost ? (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
          <div>
            <p className="font-medium">Students are sent to {currentHost}</p>
            {currentUrl ? (
              <a
                href={currentUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="mt-1 inline-flex items-center gap-1 text-primary hover:underline"
              >
                Open it yourself to check it works
                <ExternalLink className="size-3" aria-hidden />
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {pendingHost ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <p className="font-medium">A change to {pendingHost} is waiting for confirmation</p>
          <p className="mt-1 text-muted-foreground">
            Check your email and confirm it. Your current link keeps working until you do. If
            you did not request this, change your password now — someone is trying to redirect
            your income.
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <label htmlFor="payment-link" className="text-sm font-medium">
          Your payment link
        </label>
        <Input
          id="payment-link"
          value={url}
          placeholder="https://…"
          onChange={(event) => setUrl(event.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={isPending || url.trim().length < 8}
            onClick={() =>
              startTransition(async () => {
                const result = await saveMyPaymentLink({ url });
                if (!result.success) {
                  toast.error(result.error);
                  return;
                }
                if (result.data.status === "confirmation_sent") {
                  toast.success("Check your email to confirm the change.");
                } else if (result.data.status === "unchanged") {
                  toast.info("That is already your payment link.");
                } else {
                  toast.success(`Students will now be sent to ${result.data.host}.`);
                }
              })
            }
          >
            {isPending ? "Saving…" : currentHost ? "Change link" : "Save link"}
          </Button>
          {currentHost ? (
            <Button
              variant="outline"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const result = await removeMyPaymentLink();
                  if (!result.success) {
                    toast.error(result.error);
                    return;
                  }
                  setUrl("");
                  toast.success("Payment link removed.");
                })
              }
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-2 border-t border-border/60 pt-4">
        <p className="text-sm font-medium">Providers we accept for your country</p>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {providers.map((provider) => (
            <li key={provider.id}>
              <span className="font-medium text-foreground">{provider.name}</span> —{" "}
              {provider.hint}
            </li>
          ))}
        </ul>
        <p className="pt-1 text-xs text-muted-foreground">
          We only accept links from regulated payment providers. A bank account number, a
          wallet handle or a friends-and-family link leaves your student with no receipt and no
          way to dispute a payment, so we do not allow them.
        </p>
      </div>
    </section>
  );
}
