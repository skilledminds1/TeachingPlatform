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

  function submit() {
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
      });
      if (!result.success) {
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
              Grant {organizationName} a paid plan without charging. Existing PayFast
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

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={isPending || !planId}>
              {isPending ? "Saving…" : "Grant upgrade"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
