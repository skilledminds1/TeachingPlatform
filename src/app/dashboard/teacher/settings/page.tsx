import type { Metadata } from "next";

import { getNotificationPreferences } from "@/server/notifications/preferences";
import { LegalAcceptanceHistory } from "@/features/legal/components/legal-acceptance-history";
import { SettingsEditor } from "@/features/teacher-dashboard/components/settings-editor";
import { env } from "@/lib/env";
import { getLegalAcceptanceHistory } from "@/server/legal/acceptance";
import { getTeacherOnboardingData } from "@/server/teachers/onboarding";

export const metadata: Metadata = { title: "Settings" };

export default async function TeacherSettingsPage() {
  const { user, profile } = await getTeacherOnboardingData();
  const acceptances = await getLegalAcceptanceHistory(user.id);
  const notificationPreferences = await getNotificationPreferences(user.id);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-8 md:py-12">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">Settings</h1>

      <SettingsEditor
        email={user.email}
        profileSlug={profile?.slug ?? null}
        profilePublic={profile?.status === "approved"}
        appOrigin={env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}
        notificationPreferences={notificationPreferences}
      />

      <LegalAcceptanceHistory acceptances={acceptances} />
    </div>
  );
}
