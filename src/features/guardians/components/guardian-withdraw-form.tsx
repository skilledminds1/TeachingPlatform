"use client";

import { useState, useTransition } from "react";

import { withdrawGuardianConsent } from "@/actions/guardian-consent";
import { Button } from "@/components/ui/button";

/**
 * Withdrawal, from the same email link that granted permission.
 *
 * Two steps rather than one button: this is the control a parent reaches for when something
 * has gone wrong, and a single misplaced click undoing it — or a mail client prefetching the
 * link — is a worse failure than one extra confirmation.
 */
export function GuardianWithdrawForm({
  token,
  minorName,
}: {
  token: string;
  minorName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [withdrawn, setWithdrawn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (withdrawn) {
    return (
      <section className="space-y-2 rounded-xl border border-border bg-card p-6">
        <p className="font-medium">Permission withdrawn</p>
        <p className="text-sm text-muted-foreground">
          {minorName} cannot book any new lessons. Lessons already booked and confirmed still
          stand — contact the teacher directly if you need one of those cancelled, or reply to
          our email and we will help.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-6">
      <div>
        <p className="font-medium">Withdraw permission</p>
        <p className="mt-1 text-sm text-muted-foreground">
          This stops {minorName} booking any new lessons, straight away. Lessons already
          confirmed are not cancelled — that is a conversation with the teacher.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {confirming ? (
        <div className="flex flex-wrap gap-3">
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await withdrawGuardianConsent(token);
                if (!result.success) {
                  setError(result.error);
                  return;
                }
                setWithdrawn(true);
              })
            }
          >
            {isPending ? "Withdrawing…" : `Yes, withdraw permission for ${minorName}`}
          </Button>
          <Button variant="outline" disabled={isPending} onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setConfirming(true)}>
          Withdraw permission
        </Button>
      )}
    </section>
  );
}
