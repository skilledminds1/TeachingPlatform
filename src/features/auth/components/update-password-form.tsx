"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { updateRecoveredPassword } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  updateRecoveredPasswordSchema,
  type UpdateRecoveredPasswordInput,
} from "@/lib/validations/auth";

export function UpdatePasswordForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<UpdateRecoveredPasswordInput>({
    resolver: zodResolver(updateRecoveredPasswordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  function onSubmit(values: UpdateRecoveredPasswordInput): void {
    startTransition(async () => {
      const result = await updateRecoveredPassword(values);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success("Password updated. Sign in with your new password.");
      router.replace("/login");
      router.refresh();
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <FieldGroup>
        <Field data-invalid={!!form.formState.errors.newPassword || undefined}>
          <FieldLabel htmlFor="new-password">New password</FieldLabel>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!form.formState.errors.newPassword}
            {...form.register("newPassword")}
          />
          <FieldError errors={[form.formState.errors.newPassword]} />
        </Field>
        <Field data-invalid={!!form.formState.errors.confirmPassword || undefined}>
          <FieldLabel htmlFor="confirm-password">Confirm new password</FieldLabel>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!form.formState.errors.confirmPassword}
            {...form.register("confirmPassword")}
          />
          <FieldError errors={[form.formState.errors.confirmPassword]} />
        </Field>
      </FieldGroup>

      <Button type="submit" className="w-full" size="lg" disabled={isPending}>
        {isPending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
