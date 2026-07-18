"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { revokeOrganizationInvite } from "@/actions/organization-invites";
import { Button } from "@/components/ui/button";

export function RevokeInviteButton({ invitationId }: { invitationId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await revokeOrganizationInvite(invitationId);
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          toast.success("Invitation revoked.");
        })
      }
    >
      {isPending ? "Revoking…" : "Revoke"}
    </Button>
  );
}
