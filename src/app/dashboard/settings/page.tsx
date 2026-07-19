import { GraduationCap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ChangePasswordForm } from "@/features/auth/components/change-password-form";
import { getCurrentUser, getPostAuthRedirect } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Account settings",
  description: "Manage your Amazing Skills student account.",
};

export default async function StudentSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/dashboard/settings");

  const preferred = await getPostAuthRedirect(user);
  if (preferred !== "/dashboard") redirect("/dashboard/teacher/settings");

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border/60 bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <GraduationCap className="size-4" aria-hidden />
            </span>
            Amazing Skills
          </Link>
          <Button variant="ghost" render={<Link href="/dashboard" />}>
            Back to dashboard
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-6 py-8 md:py-12">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Account settings
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{user.email}</p>
        </div>

        <section className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div>
            <h2 className="font-heading text-2xl font-semibold tracking-tight">
              Change password
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Use a unique password with at least 8 characters.
            </p>
          </div>
          <ChangePasswordForm />
        </section>
      </main>
    </div>
  );
}
