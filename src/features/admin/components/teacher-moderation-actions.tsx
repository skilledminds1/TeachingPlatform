"use client";

import { Check, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  approveTeacherProfile,
  rejectTeacherProfile,
} from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TeacherModerationActions({
  profileId,
  currentStatus,
}: {
  profileId: string;
  currentStatus: string;
}) {
  const [reason, setReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [isPending, startTransition] = useTransition();

  function approve(): void {
    startTransition(async () => {
      const result = await approveTeacherProfile(profileId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Teacher profile approved.");
    });
  }

  function reject(): void {
    startTransition(async () => {
      const result = await rejectTeacherProfile(profileId, reason);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setShowReject(false);
      setReason("");
      toast.success("Teacher profile rejected.");
    });
  }

  if (showReject) {
    return (
      <div className="flex min-w-64 flex-col gap-2">
        <Input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Reason for rejection"
          aria-label="Reason for rejection"
          disabled={isPending}
        />
        <div className="flex gap-2">
          <Button
            variant="destructive"
            onClick={reject}
            disabled={isPending || reason.trim().length < 5}
          >
            Confirm rejection
          </Button>
          <Button variant="ghost" onClick={() => setShowReject(false)} disabled={isPending}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {currentStatus !== "approved" ? (
        <Button onClick={approve} disabled={isPending}>
          <Check className="size-4" aria-hidden />
          Approve
        </Button>
      ) : null}
      <Button variant="outline" onClick={() => setShowReject(true)} disabled={isPending}>
        <X className="size-4" aria-hidden />
        Reject
      </Button>
    </div>
  );
}
