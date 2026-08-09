"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  grantComplimentaryPlan,
  revokeComplimentaryPlan,
} from "@/actions/admin-subscriptions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PlanOption = {
  id: string;
  name: string;
  slug: string;
};

export function ComplimentaryGrantDialog({
  organizationId,
  organizationName,
  plans,
  isComplimentary,
}: {
  organizationId: string;
  organizationName: string;
  plans: PlanOption[];
  isComplimentary: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [permanent, setPermanent] = useState(true);
  const [expiresAt, setExpiresAt] = useState("");
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  // MON-21: holds the server's warning until the admin confirms the destructive grant.
  const [pendingConfirmation, setPendingConfirmation] = useState<string | null>(null);

  function submit(confirmCancelsPaidSubscription = false) {
    startTransition(async () => {
      const result = await grantComplimentaryPlan({
        organizationId,
        planId,
        permanent,
        expiresAt: permanent
          ? null
          : expiresAt
            ? new Date(expiresAt).toISOString()
            : null,
        note: note.trim() || null,
        confirmCancelsPaidSubscription,
      });
      if (!result.success) {
        // MON-21: the server refuses the first attempt when the organization has a live paid
        // subscription, because granting cancels it irreversibly. Surface exactly what will
        // happen and let the admin opt in, rather than doing it silently.
        if (result.code === "CONFLICT" && !confirmCancelsPaidSubscription) {
          setPendingConfirmation(result.error);
          return;
        }
        toast.error(result.error);
        return;
      }
      toast.success(`Complimentary plan granted to ${organizationName}.`);
      setOpen(false);
      router.refresh();
    });
  }

  function revoke() {
    startTransition(async () => {
      const result = await revokeComplimentaryPlan({ organizationId });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Complimentary access revoked. Organization moved to Free.");
      router.refresh();
    });
  }

  const paidPlans = plans.filter((plan) => plan.slug !== "free");

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {isComplimentary ? "Change upgrade" : "Upgrade free"}
      </Button>
      {isComplimentary ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={revoke}
        >
          Revoke
        </Button>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Complimentary upgrade</DialogTitle>
            <DialogDescription>
              Grant {organizationName} a paid plan without charging. Existing
              billing is cancelled so they are not billed while access is free.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-5 py-4">
            <div className="space-y-2">
              <Label htmlFor={`plan-${organizationId}`}>Plan</Label>
              <select
                id={`plan-${organizationId}`}
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                value={planId}
                onChange={(event) => setPlanId(event.target.value)}
              >
                {paidPlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Duration</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={permanent ? "default" : "outline"}
                  onClick={() => setPermanent(true)}
                >
                  Permanent
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={!permanent ? "default" : "outline"}
                  onClick={() => setPermanent(false)}
                >
                  Expires on date
                </Button>
              </div>
            </div>

            {!permanent ? (
              <div className="space-y-2">
                <Label htmlFor={`expires-${organizationId}`}>Expires at</Label>
                <Input
                  id={`expires-${organizationId}`}
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor={`note-${organizationId}`}>Note (optional)</Label>
              <Input
                id={`note-${organizationId}`}
                value={note}
                maxLength={500}
                placeholder="Reason for complimentary access"
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          </div>

          {pendingConfirmation ? (
            <div className="mx-5 mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
              <p className="text-sm font-medium text-destructive">
                This organization is paying you
              </p>
              <p className="mt-1 text-sm text-destructive/90">{pendingConfirmation}</p>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPendingConfirmation(null);
                setOpen(false);
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            {pendingConfirmation ? (
              <Button
                variant="destructive"
                onClick={() => submit(true)}
                disabled={isPending || !planId}
              >
                {isPending ? "Saving…" : "Cancel their subscription and grant"}
              </Button>
            ) : (
              <Button onClick={() => submit()} disabled={isPending || !planId}>
                {isPending ? "Saving…" : "Grant upgrade"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
