"use client";

import { useState, useTransition } from "react";

import { confirmGuardianConsent } from "@/actions/guardian-consent";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export function GuardianConsentForm({
  token,
  minorName,
}: {
  token: string;
  minorName: string;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [granted, setGranted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (granted) {
    return (
      <section className="space-y-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-6">
        <p className="font-medium">Permission given. Thank you.</p>
        <p className="text-sm text-muted-foreground">
          {minorName} can now book lessons. We have kept a record of this, including the date
          and time. To withdraw permission later, reply to the email we sent you.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-6">
      <div className="flex items-start gap-3">
        <Checkbox
          id="guardian-confirm"
          checked={confirmed}
          disabled={isPending}
          onCheckedChange={(next) => setConfirmed(next === true)}
        />
        <label htmlFor="guardian-confirm" className="text-sm">
          I am the parent or legal guardian of {minorName}, I have read the above, and I give
          permission for them to use Amazing Skills.
        </label>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button
        disabled={!confirmed || isPending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await confirmGuardianConsent(token);
            if (!result.success) {
              setError(result.error);
              return;
            }
            setGranted(true);
          })
        }
      >
        {isPending ? "Saving…" : "Give permission"}
      </Button>
    </section>
  );
}
