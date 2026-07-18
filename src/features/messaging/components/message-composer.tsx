"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { sendMessage } from "@/actions/messaging";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function MessageComposer({
  conversationId,
  teacherUserId,
}: {
  conversationId?: string;
  teacherUserId?: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Write a message…"
        rows={3}
        maxLength={2_000}
      />
      <div className="flex justify-end">
        <Button
          disabled={isPending || body.trim().length === 0}
          onClick={() =>
            startTransition(async () => {
              const result = await sendMessage({ conversationId, teacherUserId, body });
              if (!result.success) {
                toast.error(result.error);
                return;
              }
              setBody("");
              if (!conversationId) {
                router.push(`/dashboard/messages/${result.data.conversationId}`);
                return;
              }
              router.refresh();
            })
          }
        >
          <Send className="size-4" aria-hidden />
          {isPending ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}
