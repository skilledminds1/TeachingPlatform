"use client";

import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { approveCourse, rejectCourse } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CourseModerationActions({
  courseId,
  currentStatus,
}: {
  courseId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (currentStatus !== "pending_approval") {
    return null;
  }

  function approve(): void {
    startTransition(async () => {
      const result = await approveCourse({ courseId });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Course approved and published.");
      router.refresh();
    });
  }

  function reject(): void {
    startTransition(async () => {
      const result = await rejectCourse({ courseId, reason });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setShowReject(false);
      setReason("");
      toast.success("Course rejected.");
      router.refresh();
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
      <Button onClick={approve} disabled={isPending}>
        <Check className="size-4" aria-hidden />
        Approve
      </Button>
      <Button variant="outline" onClick={() => setShowReject(true)} disabled={isPending}>
        <X className="size-4" aria-hidden />
        Reject
      </Button>
    </div>
  );
}
