import { KeyRound, UserRound } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ChangePasswordForm } from "@/features/auth/components/change-password-form";
import { LegalAcceptanceHistory } from "@/features/legal/components/legal-acceptance-history";
import { EmailPreferencesForm } from "@/features/notifications/components/email-preferences-form";
import { StudentNavWithNotifications } from "@/features/student-dashboard/components/student-nav-with-notifications";
import { StudentSettingsForm } from "@/features/student-dashboard/components/student-settings-form";
import { getCurrentUser, getPostAuthRedirect } from "@/server/auth/session";
import { getLegalAcceptanceHistory } from "@/server/legal/acceptance";
import { getNotificationPreferences } from "@/server/notifications/preferences";

export const metadata: Metadata = {
  title: "Account settings",
  description: "Manage your Amazing Skills student account.",
};

export default async function StudentSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/dashboard/settings");

  const preferred = await getPostAuthRedirect(user);
  if (preferred === "/legal-review") redirect("/legal-review?next=/dashboard/settings");
  if (preferred !== "/dashboard") redirect("/dashboard/teacher/settings");
  const acceptances = await getLegalAcceptanceHistory(user.id);
  const notificationPreferences = await getNotificationPreferences(user.id);

  return (
    <div className="min-h-screen bg-muted/30">
      <StudentNavWithNotifications />

      <main className="mx-auto max-w-3xl space-y-8 px-6 py-8 md:py-12">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Account settings
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage your profile, regional preferences, and account security.
          </p>
        </div>

        <section className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <UserRound className="size-5" aria-hidden />
            </span>
            <div>
              <h2 className="font-heading text-2xl font-semibold tracking-tight">
                Profile and preferences
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Keep your personal details and lesson timezone accurate.
              </p>
            </div>
          </div>
          <StudentSettingsForm
            initialName={user.name}
            email={user.email}
            initialTimezone={user.timezone}
            initialAvatarUrl={user.avatarUrl ?? ""}
          />
        </section>

        <section className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <KeyRound className="size-5" aria-hidden />
            </span>
            <div>
              <h2 className="font-heading text-2xl font-semibold tracking-tight">
                Password and security
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Use a unique password with at least 8 characters.
              </p>
            </div>
          </div>
          <ChangePasswordForm />
        </section>

        <section className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div>
            <h2 className="font-heading text-2xl font-semibold tracking-tight">
              Email notifications
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose which optional updates arrive by email.
            </p>
          </div>
          <EmailPreferencesForm initialPreferences={notificationPreferences} />
        </section>

        <LegalAcceptanceHistory viewerTimeZone={user.timezone} acceptances={acceptances} />
      </main>
    </div>
  );
}
