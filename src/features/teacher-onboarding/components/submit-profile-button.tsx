"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { submitTeacherProfile } from "@/actions/teacher-onboarding";
import { Button } from "@/components/ui/button";

export function SubmitProfileButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function submit(): void {
    startTransition(async () => {
      const result = await submitTeacherProfile();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Profile submitted for approval.");
      router.refresh();
    });
  }

  return (
    <Button onClick={submit} disabled={isPending}>
      <Send className="size-4" aria-hidden />
      {isPending ? "Submitting…" : "Submit for approval"}
    </Button>
  );
}
