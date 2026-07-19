import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { CourseCreateForm } from "@/features/courses/components/course-create-form";
import { getCourseUsage } from "@/server/billing/entitlements";
import { getTeacherProfileReadiness } from "@/server/teachers/onboarding";

export const metadata: Metadata = { title: "Create course" };

export default async function NewTeacherCoursePage() {
  const readiness = await getTeacherProfileReadiness();
  const { profile, profileComplete } = readiness;

  if (!profile || !profileComplete || profile.status === "rejected") {
    redirect("/onboarding/teacher");
  }

  const usage = await getCourseUsage(profile.organizationId);

  if (!["professional", "business"].includes(usage.plan.slug) || usage.atLimit) {
    redirect("/dashboard/teacher/courses");
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-2xl items-center px-6">
          <Button variant="ghost" render={<Link href="/dashboard/teacher/courses" />}>
            <ArrowLeft className="size-4" aria-hidden />
            Back to courses
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-6 py-10">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">New course</p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Create a new course
          </h1>
          <p className="text-sm text-muted-foreground">
            Start with a working title, then build your landing page, curriculum, and media in the
            course studio.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <CourseCreateForm />
        </div>
      </main>
    </div>
  );
}
