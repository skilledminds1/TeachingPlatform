import type { Metadata } from "next";

import { AuthShell } from "@/features/auth/components/auth-shell";
import { RegisterForm } from "@/features/auth/components/register-form";
import { registerRoleSchema } from "@/lib/validations/auth";

export const metadata: Metadata = {
  title: "Get started",
  description: "Create a TeachingPlatform account as a student or teacher.",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const params = await searchParams;
  const roleParse = registerRoleSchema.safeParse(params.role);
  const defaultRole = roleParse.success ? roleParse.data : "student";

  return (
    <AuthShell
      title="Create your account"
      description={
        defaultRole === "teacher"
          ? "Start your teaching practice — Free plan included."
          : "Find tutors and book live lessons in minutes."
      }
    >
      <RegisterForm defaultRole={defaultRole} />
    </AuthShell>
  );
}
