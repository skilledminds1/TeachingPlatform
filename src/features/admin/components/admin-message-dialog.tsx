"use client";

import { Send, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { sendAdminMessage } from "@/actions/admin-messaging";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export function AdminMessageDialog({
  recipientId,
  recipientName,
  conversationId,
  buttonLabel = "Message",
}: {
  recipientId?: string;
  recipientName: string;
  conversationId?: string;
  buttonLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();

  function send(): void {
    startTransition(async () => {
      const result = await sendAdminMessage({
        recipientId,
        conversationId,
        body,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setBody("");
      setOpen(false);
      toast.success(`Message sent to ${recipientName}.`);
      router.push(`/admin/messages/${result.data.conversationId}`);
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Send className="size-3.5" aria-hidden />
        {buttonLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Message {recipientName}</DialogTitle>
            <DialogDescription>
              This message will appear prominently in their inbox as an official
              Platform Owner message.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 px-5 py-4">
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-700 dark:text-amber-400">
              <ShieldCheck className="size-4" aria-hidden />
              Sending as Platform Owner
            </div>
            <Textarea
              value={body}
              rows={6}
              maxLength={2_000}
              // GLO-03: moving focus into a modal when it opens is correct focus management
              // (WCAG 2.4.3), not the unsolicited page-load autofocus the rule targets.
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              placeholder="Write an official platform message…"
              onChange={(event) => setBody(event.target.value)}
            />
            <p className="text-right text-xs text-muted-foreground">
              {body.length}/2,000
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button disabled={isPending || !body.trim()} onClick={send}>
              {isPending ? "Sending…" : "Send official message"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
