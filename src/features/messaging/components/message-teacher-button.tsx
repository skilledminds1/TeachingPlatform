"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { startConversationWithTeacher } from "@/actions/messaging";
import { Button } from "@/components/ui/button";

export function MessageTeacherButton({
  teacherUserId,
}: {
  teacherUserId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      className="w-full"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await startConversationWithTeacher(teacherUserId);
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          router.push(`/dashboard/messages/${result.data.conversationId}`);
        })
      }
    >
      {isPending ? "Opening…" : "Message teacher"}
    </Button>
  );
}
