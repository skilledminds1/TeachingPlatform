"use client";

import { Check, X } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { moderateReview } from "@/actions/admin";
import { Button } from "@/components/ui/button";

export function ReviewModerationActions({
  reviewId,
  currentStatus,
}: {
  reviewId: string;
  currentStatus: string;
}) {
  const [isPending, startTransition] = useTransition();

  function moderate(decision: "approved" | "rejected"): void {
    startTransition(async () => {
      const result = await moderateReview(reviewId, decision);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`Review ${decision}.`);
    });
  }

  return (
    <div className="flex items-center gap-2">
      {currentStatus !== "approved" ? (
        <Button onClick={() => moderate("approved")} disabled={isPending}>
          <Check className="size-4" aria-hidden />
          Approve
        </Button>
      ) : null}
      {currentStatus !== "rejected" ? (
        <Button
          variant="outline"
          onClick={() => moderate("rejected")}
          disabled={isPending}
        >
          <X className="size-4" aria-hidden />
          Reject
        </Button>
      ) : null}
    </div>
  );
}
