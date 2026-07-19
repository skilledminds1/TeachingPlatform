import type { Metadata } from "next";

import { AuthShell } from "@/features/auth/components/auth-shell";
import { UpdatePasswordForm } from "@/features/auth/components/update-password-form";

export const metadata: Metadata = {
  title: "Choose a new password",
  description: "Choose a new password for your Amazing Skills account.",
};

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Choose a new password"
      description="Enter and confirm the new password for your account."
    >
      <UpdatePasswordForm />
    </AuthShell>
  );
}
