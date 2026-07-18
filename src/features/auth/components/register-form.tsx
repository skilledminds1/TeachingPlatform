"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { signUp } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  signUpSchema,
  type RegisterRole,
  type SignUpInput,
} from "@/lib/validations/auth";

import { GoogleSignInButton } from "./google-sign-in-button";

export function RegisterForm({
  defaultRole = "student",
  redirectTo = null,
}: {
  defaultRole?: RegisterRole;
  redirectTo?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      role: defaultRole,
    },
  });

  const role = useWatch({
    control: form.control,
    name: "role",
  });

  function onSubmit(values: SignUpInput): void {
    setFormError(null);
    startTransition(async () => {
      const result = await signUp(values);
      if (!result.success) {
        setFormError(result.error);
        toast.error(result.error);
        return;
      }

      if (result.data.needsEmailConfirmation) {
        setNeedsConfirmation(true);
        toast.success("Check your email to confirm your account.");
        return;
      }

      if (result.data.redirectTo) {
        router.push(redirectTo ?? result.data.redirectTo);
        router.refresh();
      }
    });
  }

  if (needsConfirmation) {
    return (
      <div className="space-y-4 rounded-xl border border-border bg-card p-6 text-center">
        <h2 className="text-lg font-semibold">Confirm your email</h2>
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link to your inbox. Open it to finish creating your account,
          then sign in.
        </p>
        <Button variant="outline" render={<Link href="/login" />}>
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-border p-1">
        <Button
          type="button"
          variant={role === "student" ? "default" : "ghost"}
          className="w-full"
          onClick={() => form.setValue("role", "student")}
        >
          I&apos;m a student
        </Button>
        <Button
          type="button"
          variant={role === "teacher" ? "default" : "ghost"}
          className="w-full"
          onClick={() => form.setValue("role", "teacher")}
        >
          I&apos;m a teacher
        </Button>
      </div>

      <GoogleSignInButton role={role} redirectTo={redirectTo} />
      <FieldSeparator>or continue with email</FieldSeparator>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <FieldGroup>
          <Field data-invalid={!!form.formState.errors.name || undefined}>
            <FieldLabel htmlFor="name">Full name</FieldLabel>
            <Input
              id="name"
              autoComplete="name"
              aria-invalid={!!form.formState.errors.name}
              {...form.register("name")}
            />
            <FieldError errors={[form.formState.errors.name]} />
          </Field>

          <Field data-invalid={!!form.formState.errors.email || undefined}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={!!form.formState.errors.email}
              {...form.register("email")}
            />
            <FieldError errors={[form.formState.errors.email]} />
          </Field>

          <Field data-invalid={!!form.formState.errors.password || undefined}>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!form.formState.errors.password}
              {...form.register("password")}
            />
            <FieldDescription>At least 8 characters</FieldDescription>
            <FieldError errors={[form.formState.errors.password]} />
          </Field>
        </FieldGroup>

        <input type="hidden" {...form.register("role")} />

        {formError ? (
          <p className="text-sm text-destructive" role="alert">
            {formError}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={isPending} size="lg">
          {isPending
            ? "Creating account…"
            : role === "teacher"
              ? "Create teacher account"
              : "Create student account"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href={
            redirectTo
              ? `/login?redirect=${encodeURIComponent(redirectTo)}`
              : "/login"
          }
          className="font-medium text-foreground hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
