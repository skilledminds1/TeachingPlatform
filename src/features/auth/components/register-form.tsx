"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useState, useTransition } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { signUp } from "@/actions/auth";
import { isMinor } from "@/lib/age";
import { countryOptions } from "@/lib/countries";
import { countryForTimeZone } from "@/lib/timezone-country";
import { detectBrowserTimeZone } from "@/hooks/use-browser-timezone";
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

  // INT-13: pre-select from the browser zone so the common case is one fewer field to
  // fill. A guess, not evidence — the user owns the value and can change it, and an
  // unmapped zone simply leaves the field empty rather than inventing a country.
  const [detectedCountry] = useState(
    () => countryForTimeZone(detectBrowserTimeZone()) ?? undefined,
  );
  const countries = useMemo(() => countryOptions(), []);

  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      role: defaultRole,
      country: detectedCountry,
      dateOfBirth: "",
      acceptedTerms: false,
      acceptedPrivacy: false,
      acceptedRefundPolicy: false,
      acceptedTeacherAgreement: false,
    },
  });

  const role = useWatch({
    control: form.control,
    name: "role",
  });
  const agreementValues = useWatch({
    control: form.control,
    name: [
      "acceptedTerms",
      "acceptedPrivacy",
      "acceptedRefundPolicy",
      "acceptedTeacherAgreement",
    ],
  });
  const agreementsComplete =
    agreementValues[0] &&
    agreementValues[1] &&
    agreementValues[2] &&
    (role !== "teacher" || agreementValues[3]);

  // Guardian fields appear as soon as the stated date of birth is under 18, so the
  // requirement is visible while typing rather than arriving as a validation error on submit.
  const dateOfBirth = useWatch({ control: form.control, name: "dateOfBirth" });
  const registeringMinor =
    /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth ?? "") &&
    isMinor(new Date(`${dateOfBirth}T00:00:00.000Z`)) === true;

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

          <Field data-invalid={!!form.formState.errors.country || undefined}>
            <FieldLabel htmlFor="country">Country</FieldLabel>
            <select
              id="country"
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-invalid={!!form.formState.errors.country}
              {...form.register("country")}
            >
              <option value="">Select your country</option>
              {countries.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name}
                </option>
              ))}
            </select>
            <FieldDescription>
              Where you live. This determines how you can be paid and which taxes apply.
            </FieldDescription>
            <FieldError errors={[form.formState.errors.country]} />
          </Field>
        </FieldGroup>

        <input type="hidden" {...form.register("role")} />

        <Field>
          <FieldLabel htmlFor="dateOfBirth">Date of birth</FieldLabel>
          <Input id="dateOfBirth" type="date" {...form.register("dateOfBirth")} />
          <FieldDescription>
            {registeringMinor
              ? "Under 18s can learn here with a parent or guardian's permission."
              : "We ask so we know whether a parent or guardian needs to give permission."}
          </FieldDescription>
          <FieldError errors={[form.formState.errors.dateOfBirth]} />
        </Field>

        {registeringMinor && role !== "teacher" ? (
          <fieldset className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
            <legend className="px-1 text-sm font-semibold">Parent or guardian</legend>
            <p className="text-sm text-muted-foreground">
              We will email them to ask permission. You can create your account now, but you
              cannot book a lesson until they confirm.
            </p>
            <Field>
              <FieldLabel htmlFor="guardianName">Their full name</FieldLabel>
              <Input id="guardianName" {...form.register("guardian.guardianName")} />
              <FieldError errors={[form.formState.errors.guardian?.guardianName]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="guardianEmail">Their email address</FieldLabel>
              <Input id="guardianEmail" type="email" {...form.register("guardian.guardianEmail")} />
              <FieldError errors={[form.formState.errors.guardian?.guardianEmail]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="relationship">How are they related to you?</FieldLabel>
              <Input
                id="relationship"
                placeholder="Mother, father, grandparent, legal guardian…"
                {...form.register("guardian.relationship")}
              />
              <FieldError errors={[form.formState.errors.guardian?.relationship]} />
            </Field>
          </fieldset>
        ) : null}

        <fieldset className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
          <legend className="px-1 text-sm font-semibold">Required agreements</legend>
          <AgreementCheckbox
            id="acceptedTerms"
            label={
              <>
                I accept the{" "}
                <LegalLink href="/terms">Terms of Service</LegalLink>.
              </>
            }
            register={form.register("acceptedTerms")}
          />
          <AgreementCheckbox
            id="acceptedPrivacy"
            label={
              <>
                I acknowledge the{" "}
                <LegalLink href="/privacy">Privacy Policy</LegalLink>.
              </>
            }
            register={form.register("acceptedPrivacy")}
          />
          <AgreementCheckbox
            id="acceptedRefundPolicy"
            label={
              <>
                I accept the{" "}
                <LegalLink href="/refund-policy">
                  Refund and Direct Payment Policy
                </LegalLink>
                , including that teachers receive payments directly and are responsible for
                refunds.
              </>
            }
            register={form.register("acceptedRefundPolicy")}
          />
          {role === "teacher" ? (
            <AgreementCheckbox
              id="acceptedTeacherAgreement"
              label={
                <>
                  I accept the{" "}
                  <LegalLink href="/teacher-agreement">Teacher Agreement</LegalLink> and
                  understand that I am the merchant of record for student payments.
                </>
              }
              register={form.register("acceptedTeacherAgreement")}
            />
          ) : null}
          {Object.keys(form.formState.errors).some((key) => key.startsWith("accepted")) ? (
            <p className="text-xs text-destructive" role="alert">
              Accept every required agreement before creating your account.
            </p>
          ) : null}
        </fieldset>

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

      <FieldSeparator>or</FieldSeparator>
      <GoogleSignInButton
        role={role}
        redirectTo={redirectTo}
        disabled={!agreementsComplete}
      />
      {!agreementsComplete ? (
        <p className="text-center text-xs text-muted-foreground">
          Accept the required agreements before continuing with Google.
        </p>
      ) : null}

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

function AgreementCheckbox({
  id,
  label,
  register,
}: {
  id: string;
  label: ReactNode;
  register: UseFormRegisterReturn;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 accent-primary"
        {...register}
      />
      <span>{label}</span>
    </label>
  );
}

function LegalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      target="_blank"
      className="font-medium text-primary underline-offset-4 hover:underline"
    >
      {children}
    </Link>
  );
}
