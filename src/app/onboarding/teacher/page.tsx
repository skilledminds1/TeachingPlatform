import type { Metadata } from "next";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { OnboardingWizard } from "@/features/teacher-onboarding/components/onboarding-wizard";
import { isLessonCurrency } from "@/lib/currencies";
import { getTeacherOnboardingData } from "@/server/teachers/onboarding";

export const metadata: Metadata = {
  title: "Teacher onboarding",
  description: "Create your Amazing Skills teacher profile.",
};

export default async function TeacherOnboardingPage() {
  const { user, organization, subjects, profile } = await getTeacherOnboardingData();

  if (profile && ["pending_approval", "approved"].includes(profile.status)) {
    redirect("/dashboard/teacher");
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck className="size-4" aria-hidden />
            </span>
            Amazing Skills
          </Link>
          <Button variant="ghost" render={<Link href="/dashboard/teacher" />}>
            <ArrowLeft className="size-4" aria-hidden />
            Dashboard
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10 md:py-14">
        <div className="mb-8 space-y-2">
          <p className="text-sm font-medium text-primary">Teacher onboarding</p>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Build your teacher profile
          </h1>
          <p className="text-muted-foreground">
            Complete these four steps to prepare your profile for the marketplace.
          </p>
        </div>

        {profile?.status === "rejected" && profile.rejectionReason ? (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
            <p className="font-medium text-destructive">Changes requested by the review team</p>
            <p className="mt-1 text-muted-foreground">{profile.rejectionReason}</p>
          </div>
        ) : null}

        <OnboardingWizard
          subjects={subjects}
          organizationName={organization.name}
          defaultValues={{
            name: user.name,
            timezone: user.timezone,
            avatarUrl: user.avatarUrl ?? "",
            headline: profile?.headline ?? "",
            bio: profile?.bio ?? "",
            hourlyRate:
              profile && profile.hourlyRateCents > 0
                ? String(profile.hourlyRateCents / 100)
                : "",
            currency:
              profile?.currency && isLessonCurrency(profile.currency)
                ? profile.currency
                : "USD",
            subjectIds: profile?.subjects.map((subject) => subject.subjectId) ?? [],
            subjectSpecialties: Object.fromEntries(
              (profile?.subjects ?? [])
                .filter((subject) => subject.specialties.length > 0)
                .map((subject) => [subject.subjectId, subject.specialties]),
            ),
            qualifications:
              profile?.qualifications.map((qualification) => ({
                title: qualification.title,
                institution: qualification.institution,
                issuedYear: String(qualification.issuedYear),
                credentialUrl: qualification.credentialUrl ?? "",
              })) ?? [
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
