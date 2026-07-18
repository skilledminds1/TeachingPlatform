"use client";

import { Building2, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { acceptOrganizationInvite } from "@/actions/organization-invites";
import { Button } from "@/components/ui/button";

export function AcceptInviteCard({ token }: { token: string }) {
  const router = useRouter();
  const [organizationName, setOrganizationName] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (organizationName) {
    return (
      <div className="space-y-5 text-center">
        <CheckCircle2 className="mx-auto size-10 text-emerald-500" aria-hidden />
        <div>
          <h1 className="text-2xl font-semibold">Invitation accepted</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You are now a member of {organizationName}.
          </p>
        </div>
        <Button
          onClick={() => {
            router.push("/dashboard");
            router.refresh();
          }}
        >
          Go to dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Building2 className="size-5" aria-hidden />
      </div>
      <div>
        <h1 className="text-2xl font-semibold">Organization invitation</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Accept this invitation to join the Amazing Skills organization.
        </p>
      </div>
      <Button
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptOrganizationInvite(token);
            if (!result.success) {
              toast.error(result.error);
              return;
            }
            setOrganizationName(result.data.organizationName);
          })
        }
      >
        {isPending ? "Accepting…" : "Accept invitation"}
      </Button>
    </div>
  );
}
