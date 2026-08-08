"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import {
  isRestrictedJurisdiction,
  restrictedJurisdictionMessage,
} from "@/lib/compliance/restricted-jurisdictions";
import { isMinor } from "@/lib/age";
import { env } from "@/lib/env";
import { logger } from "@/lib/observability/logger";
import { createClient } from "@/lib/supabase/server";
import { recordComplianceEvent } from "@/server/compliance/events";
import { requestGuardianConsent } from "@/server/guardians/consent";
import {
  changePasswordSchema,
  registerRoleSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  updateRecoveredPasswordSchema,
  type RegisterRole,
} from "@/lib/validations/auth";
import { getPostAuthRedirect, syncUserFromAuth } from "@/server/auth/session";
import { recordCurrentLegalAcceptances } from "@/server/legal/acceptance";
import {
  clientIdentityFromHeaders,
  enforceActionRateLimit,
} from "@/server/security/action-rate-limit";
import { safeRedirectPath } from "@/lib/security/redirect";
import { fail, ok, type ActionResult } from "@/types/action";
import { db } from "@/lib/db";

function appUrl(path: string): string {
  return new URL(path, env.NEXT_PUBLIC_APP_URL).toString();
}

// NOTE: imported, not re-exported — every export from a "use server" module must be an
// async function, so `export { safeRedirectPath }` here would fail the build.

export async function signUp(
  input: unknown,
): Promise<ActionResult<{ needsEmailConfirmation: boolean; redirectTo?: string }>> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid input", "VALIDATION_ERROR");
  }
  const limited = await enforceActionRateLimit({ action: "signup", limit: 5, windowMs: 15 * 60_000, identifier: parsed.data.email, critical: true });
  if (limited) return limited;

  const { name, email, password, role, country, dateOfBirth, guardian } = parsed.data;
  const birthDate = new Date(`${dateOfBirth}T00:00:00.000Z`);
  const minor = isMinor(birthDate) === true;

  // INT-13: refuse before an account exists, and record why. This runs in the action rather
  // than the schema because it is a trust decision that must leave an audit trail, and a
  // client-side copy of the blocklist is advisory at best.
  if (isRestrictedJurisdiction(country)) {
    await recordComplianceEvent({
      kind: "jurisdiction_blocked",
      email,
      countryCode: country,
      detail: { stage: "registration", role },
    });
    return fail(restrictedJurisdictionMessage(country), "FORBIDDEN");
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, role },
      emailRedirectTo: appUrl("/auth/callback"),
    },
  });

  if (error) {
    return fail(error.message, "VALIDATION_ERROR");
  }

  if (!data.user) {
    return fail("Could not create account. Please try again.");
  }

  await syncUserFromAuth(data.user, { role, country, dateOfBirth: birthDate });
  const requestHeaders = await headers();
  const evidence = {
    ip: clientIdentityFromHeaders(requestHeaders),
    userAgent: requestHeaders.get("user-agent"),
  };
  await recordCurrentLegalAcceptances({
    userId: data.user.id,
    role,
    method: "email_signup",
    confirmedAdult: !minor,
    evidence,
  });

  // The account exists either way; what a minor cannot do is book, until the guardian named
  // here confirms. Creating the account first is deliberate — a child who cannot sign in
  // cannot see what they are waiting for, and the guardian needs something to consent TO.
  if (minor && guardian) {
    await requestGuardianConsent({
      minorUserId: data.user.id,
      minorName: name,
      guardian,
      evidence,
    }).catch((error: unknown) => {
      // A failed send must not fail registration: the student can resend from their
      // dashboard, and losing the account over a transient mail error is worse.
      logger.error("guardian_consent_request_failed", { userId: data.user?.id, error });
    });
  }

  if (data.session) {
    const sessionUser = await db.user.findUniqueOrThrow({
      where: { id: data.user.id },
      include: {
        memberships: {
          include: {
            organization: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    return ok({
      needsEmailConfirmation: false,
      redirectTo: await getPostAuthRedirect(sessionUser),
    });
  }

  return ok({ needsEmailConfirmation: true });
}

export async function signIn(
  input: unknown,
  redirectTo?: string | null,
): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid input", "VALIDATION_ERROR");
  }
  const limited = await enforceActionRateLimit({ action: "signin", limit: 10, windowMs: 15 * 60_000, identifier: parsed.data.email, critical: true });
  if (limited) return limited;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return fail("Invalid email or password.", "UNAUTHORIZED");
  }

  if (!data.user) {
    return fail("Could not sign in. Please try again.");
  }

  const role = registerRoleSchema.safeParse(data.user.user_metadata?.role).success
    ? (data.user.user_metadata.role as RegisterRole)
    : undefined;

  await syncUserFromAuth(data.user, { role });

  const sessionUser = await db.user.findUniqueOrThrow({
    where: { id: data.user.id },
    include: {
      memberships: {
        include: {
          organization: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });

  const defaultDestination = await getPostAuthRedirect(sessionUser);
  const intendedDestination = safeRedirectPath(redirectTo);
  const destination =
    defaultDestination === "/legal-review"
      ? `/legal-review${
          intendedDestination
            ? `?next=${encodeURIComponent(intendedDestination)}`
            : ""
        }`
      : intendedDestination ?? defaultDestination;

  return ok({ redirectTo: destination });
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function resetPassword(input: unknown): Promise<ActionResult<{ sent: true }>> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid input", "VALIDATION_ERROR");
  }
  const limited = await enforceActionRateLimit({ action: "password-reset", limit: 5, windowMs: 60 * 60_000, identifier: parsed.data.email, critical: true });
  if (limited) return limited;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: appUrl("/auth/callback?next=/reset-password"),
  });

  if (error) {
    return fail(error.message, "VALIDATION_ERROR");
  }

  // Always succeed from the client perspective to avoid email enumeration.
  return ok({ sent: true });
}

export async function changePassword(
  input: unknown,
): Promise<ActionResult<{ changed: true }>> {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid input", "VALIDATION_ERROR");
  }
  const limited = await enforceActionRateLimit({ action: "password-change", limit: 5, windowMs: 15 * 60_000, critical: true });
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return fail("Your session has expired. Sign in again.", "UNAUTHORIZED");
  }

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });
  if (verifyError) {
    return fail("Current password is incorrect.", "UNAUTHORIZED");
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });
  if (error) {
    return fail(error.message, "VALIDATION_ERROR");
  }

  return ok({ changed: true });
}

export async function updateRecoveredPassword(
  input: unknown,
): Promise<ActionResult<{ changed: true }>> {
  const parsed = updateRecoveredPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid input", "VALIDATION_ERROR");
  }
  const limited = await enforceActionRateLimit({ action: "password-recovery", limit: 5, windowMs: 15 * 60_000, critical: true });
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return fail(
      "This reset link is invalid or has expired. Request a new one.",
      "UNAUTHORIZED",
    );
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });
  if (error) {
    return fail(error.message, "VALIDATION_ERROR");
  }

  await supabase.auth.signOut();
  return ok({ changed: true });
}

export async function signInWithGoogle(
  role?: RegisterRole,
  redirectTo?: string | null,
): Promise<ActionResult<{ url: string }>> {
  const limited = await enforceActionRateLimit({ action: "oauth", limit: 10, windowMs: 15 * 60_000 });
  if (limited) return limited;
  const supabase = await createClient();
  const next = safeRedirectPath(redirectTo) ?? "/dashboard";
  const callback = new URL(appUrl("/auth/callback"));
  callback.searchParams.set("next", next);
  if (role) {
    callback.searchParams.set("role", role);
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callback.toString(),
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  if (error || !data.url) {
    return fail(error?.message ?? "Could not start Google sign-in.");
  }

  return ok({ url: data.url });
}
