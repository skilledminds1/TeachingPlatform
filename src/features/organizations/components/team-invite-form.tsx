"use client";

import { Copy, Send } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createOrganizationInvite } from "@/actions/organization-invites";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TeamInviteForm({
  organizationId,
  canInviteTeachers,
}: {
  organizationId: string;
  canInviteTeachers: boolean;
}) {
  const [email, setEmail] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function createInvite(): void {
    startTransition(async () => {
      const result = await createOrganizationInvite({
        organizationId,
        email,
        role: "instructor",
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setInviteUrl(result.data.inviteUrl);
      setEmail("");
      toast.success("Invitation link created.");
    });
  }

  async function copyLink(): Promise<void> {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    toast.success("Invitation link copied.");
  }

  if (!canInviteTeachers) {
    return (
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
        <p className="font-medium">Unlock team teachers with Business</p>
        <p className="mt-1 text-muted-foreground">
          Upgrade to invite additional instructors into this organization.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="teacher@example.com"
          aria-label="Teacher email"
        />
        <Button onClick={createInvite} disabled={isPending || !email.trim()}>
          <Send className="size-4" aria-hidden />
          {isPending ? "Creating…" : "Invite teacher"}
        </Button>
      </div>
      {inviteUrl ? (
        <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
          <p className="min-w-0 flex-1 truncate font-mono text-xs">{inviteUrl}</p>
          <Button size="sm" variant="outline" onClick={copyLink}>
            <Copy className="size-3.5" aria-hidden />
            Copy
          </Button>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Links expire after seven days. Email delivery will be enabled when Resend is configured.
      </p>
    </div>
  );
}
