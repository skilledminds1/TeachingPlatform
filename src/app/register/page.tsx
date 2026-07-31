import type { Metadata } from "next";

import { AuthShell } from "@/features/auth/components/auth-shell";
import { RegisterForm } from "@/features/auth/components/register-form";
import { safeRedirectPath } from "@/lib/security/redirect";
import { registerRoleSchema } from "@/lib/validations/auth";

export const metadata: Metadata = {
  title: "Get started",
  description: "Create an Amazing Skills account as a student or teacher.",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; redirect?: string }>;
}) {
  const params = await searchParams;
  const roleParse = registerRoleSchema.safeParse(params.role);
  const defaultRole = roleParse.success ? roleParse.data : "student";
  const redirectTo = safeRedirectPath(params.redirect);

  return (
    <AuthShell
      title="Create your account"
      description={
        defaultRole === "teacher"
          ? "Start your teaching practice — Free plan included."
          : "Find tutors and book live lessons in minutes."
      }
    >
      <RegisterForm defaultRole={defaultRole} redirectTo={redirectTo} />
    </AuthShell>
  );
}
