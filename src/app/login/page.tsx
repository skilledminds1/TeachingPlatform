import type { Metadata } from "next";

import { AuthShell } from "@/features/auth/components/auth-shell";
import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to TeachingPlatform to book tutors or manage your teaching practice.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; error?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthShell title="Welcome back" description="Sign in to continue to TeachingPlatform.">
      {params.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
          Authentication failed. Please try signing in again.
        </p>
      ) : null}
      <LoginForm redirectTo={params.redirect} />
    </AuthShell>
  );
}
