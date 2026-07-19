"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { toast } from "sonner";

import { changePassword } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  changePasswordSchema,
  type ChangePasswordInput,
} from "@/lib/validations/auth";

function PasswordInput({
  id,
  label,
  autoComplete,
  registration,
  error,
}: {
  id: string;
  label: string;
  autoComplete: string;
  registration: UseFormRegisterReturn;
  error?: { message?: string };
}) {
  const [visible, setVisible] = useState(false);

  return (
    <Field data-invalid={Boolean(error) || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          className="pr-10"
          aria-invalid={Boolean(error)}
          {...registration}
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label={visible ? `Hide ${label}` : `Show ${label}`}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      <FieldError errors={[error]} />
    </Field>
  );
}

export function ChangePasswordForm() {
  const [isPending, startTransition] = useTransition();
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  function onSubmit(values: ChangePasswordInput): void {
    startTransition(async () => {
      const result = await changePassword(values);
      if (!result.success) {
        if (result.error === "Current password is incorrect.") {
          form.setError("currentPassword", { message: result.error });
        } else {
          toast.error(result.error);
        }
        return;
      }

      form.reset();
      toast.success("Password changed successfully.");
    });
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="max-w-md space-y-6"
      noValidate
    >
      <FieldGroup className="space-y-5">
        <div className="space-y-2">
          <PasswordInput
            id="current-password"
            label="Current password"
            autoComplete="current-password"
            registration={form.register("currentPassword")}
            error={form.formState.errors.currentPassword}
          />
          <Link
            href="/forgot-password"
            className="inline-block text-sm text-primary underline-offset-4 hover:underline"
          >
            Forgot your password?
          </Link>
        </div>
        <PasswordInput
          id="new-password"
          label="New password"
          autoComplete="new-password"
          registration={form.register("newPassword")}
          error={form.formState.errors.newPassword}
        />
        <PasswordInput
          id="verify-password"
          label="Verify password"
          autoComplete="new-password"
          registration={form.register("confirmPassword")}
          error={form.formState.errors.confirmPassword}
        />
      </FieldGroup>
      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
        {isPending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
