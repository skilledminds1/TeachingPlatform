"use server";

import { redirect } from "next/navigation";

import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
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
import { fail, ok, type ActionResult } from "@/types/action";
import { db } from "@/lib/db";

function appUrl(path: string): string {
  return new URL(path, env.NEXT_PUBLIC_APP_URL).toString();
}

function safeRedirectPath(path: string | null | undefined): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//")) {
    return null;
  }
  return path;
}

export async function signUp(
  input: unknown,
): Promise<ActionResult<{ needsEmailConfirmation: boolean; redirectTo?: string }>> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid input", "VALIDATION_ERROR");
  }

  const { name, email, password, role } = parsed.data;
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

  await syncUserFromAuth(data.user, { role });

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

  const destination =
    safeRedirectPath(redirectTo) ?? (await getPostAuthRedirect(sessionUser));

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
