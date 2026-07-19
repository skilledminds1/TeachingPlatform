"use client";

import { Send, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { sendAdminMessage } from "@/actions/admin-messaging";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function AdminMessageComposer({
  conversationId,
}: {
  conversationId: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();

  function send(): void {
    startTransition(async () => {
      const result = await sendAdminMessage({ conversationId, body });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setBody("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
        <ShieldCheck className="size-3.5" aria-hidden />
        Replying as Platform Owner
      </div>
      <Textarea
        value={body}
        rows={3}
        maxLength={2_000}
        placeholder="Write an official platform message…"
        onChange={(event) => setBody(event.target.value)}
      />
      <div className="flex justify-end">
        <Button disabled={isPending || !body.trim()} onClick={send}>
          <Send className="size-4" aria-hidden />
          {isPending ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}
