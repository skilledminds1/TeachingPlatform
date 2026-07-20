"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { signInWithGoogle } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import type { RegisterRole } from "@/lib/validations/auth";

export function GoogleSignInButton({
  role,
  redirectTo,
  disabled = false,
}: {
  role?: RegisterRole;
  redirectTo?: string | null;
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick(): void {
    setError(null);
    startTransition(async () => {
      const result = await signInWithGoogle(role, redirectTo);
      if (!result.success) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      window.location.assign(result.data.url);
    });
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={isPending || disabled}
        onClick={handleClick}
      >
        {isPending ? "Redirecting…" : "Continue with Google"}
      </Button>
      {error ? (
        <p className="text-center text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
