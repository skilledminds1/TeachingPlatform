import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { OnboardingWizard } from "@/features/teacher-onboarding/components/onboarding-wizard";
import { getTeacherOnboardingData } from "@/server/teachers/onboarding";

export const metadata: Metadata = {
  title: "Edit teacher profile",
  description: "Update your public Amazing Skills teacher profile.",
};

export default async function TeacherProfileSettingsPage() {
  const { user, organization, subjects, profile } = await getTeacherOnboardingData();
  if (!profile) redirect("/onboarding/teacher");

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Button variant="ghost" render={<Link href="/dashboard/teacher" />}>
            <ArrowLeft className="size-4" aria-hidden />
            Dashboard
          </Button>
          {profile.status === "approved" ? (
            <Button variant="outline" render={<Link href={`/teachers/${profile.slug}`} />}>
              View public profile
              <ExternalLink className="size-4" aria-hidden />
            </Button>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10 md:py-14">
        <div className="mb-8 space-y-2">
          <p className="text-sm font-medium text-primary">Teacher profile</p>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Edit your profile
          </h1>
          <p className="text-muted-foreground">
            Update your photo, personal details, biography, qualifications, subjects, and lesson
            price.
          </p>
        </div>

        <OnboardingWizard
          mode="edit"
          subjects={subjects}
          organizationName={organization.name}
          defaultValues={{
            name: user.name,
            timezone: user.timezone,
            avatarUrl: user.avatarUrl ?? "",
            headline: profile.headline ?? "",
            bio: profile.bio,
            hourlyRate:
              profile.hourlyRateCents > 0 ? String(profile.hourlyRateCents / 100) : "",
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
      </main>
    </div>
  );
}
