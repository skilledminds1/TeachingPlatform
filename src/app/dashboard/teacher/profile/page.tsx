import type { Metadata } from "next";
import { toEditableLanguages } from "@/lib/languages";
import { redirect } from "next/navigation";

import { ProfileEditor } from "@/features/teacher-onboarding/components/profile-editor";
import { isLessonCurrency } from "@/lib/currencies";
import { getTeacherOnboardingData } from "@/server/teachers/onboarding";

export const metadata: Metadata = {
  title: "My profile",
  description: "Update your public Amazing Skills teacher profile.",
};

export default async function TeacherProfileSettingsPage() {
  const { user, subjects, profile } = await getTeacherOnboardingData();
  if (!profile) redirect("/onboarding/teacher");

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 md:py-12">
      <h1 className="mb-8 font-heading text-3xl font-semibold tracking-tight">My profile</h1>

      <ProfileEditor
        subjects={subjects}
        profileStatus={profile.status}
        profileSlug={profile.slug}
          defaultValues={{
          name: user.name,
          timezone: user.timezone,
          avatarUrl: user.avatarUrl ?? "",
          headline: profile.headline ?? "",
          bio: profile.bio,
          hourlyRate:
            profile.hourlyRateCents > 0 ? String(profile.hourlyRateCents / 100) : "",
          currency: isLessonCurrency(profile.currency) ? profile.currency : "USD",
          introVideoUrl: profile.introVideoUrl ?? "",
          introVideoPath: profile.introVideoPath ?? "",
          // INT-10: existing profiles were backfilled to English by the migration, so this
          // is only empty for a profile created before that ran.
          languages: toEditableLanguages(profile.languages),
          subjectIds: profile.subjects.map((subject) => subject.subjectId),
          subjectSpecialties: Object.fromEntries(
            profile.subjects
              .filter((subject) => subject.specialties.length > 0)
              .map((subject) => [subject.subjectId, subject.specialties]),
          ),
          qualifications:
            profile.qualifications.length > 0
              ? profile.qualifications.map((qualification) => ({
                  title: qualification.title,
                  institution: qualification.institution,
                  issuedYear: String(qualification.issuedYear),
                  credentialUrl: qualification.credentialUrl ?? "",
                }))
              : [
                  {
                    title: "",
                    institution: "",
                    issuedYear: "",
                    credentialUrl: "",
                  },
                ],
        }}
      />
    </div>
  );
}
