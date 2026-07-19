import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { CourseCurriculumEditor } from "@/features/courses/components/course-curriculum-editor";
import { CourseEditForm } from "@/features/courses/components/course-edit-form";
import { getCourseUsage } from "@/server/billing/entitlements";
import { getCourseForTeacherEdit } from "@/server/courses/queries";
import { getMarketplaceSubjects } from "@/server/marketplace/teachers";
import { getTeacherProfileReadiness } from "@/server/teachers/onboarding";

export const metadata: Metadata = { title: "Edit course" };

export default async function TeacherCourseEditPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const readiness = await getTeacherProfileReadiness();
  const { user, profile, profileComplete } = readiness;

  if (!profile || !profileComplete || profile.status === "rejected") {
    redirect("/onboarding/teacher");
  }

  const [course, subjects, usage] = await Promise.all([
    getCourseForTeacherEdit(courseId, user.id),
    getMarketplaceSubjects(),
    getCourseUsage(profile.organizationId),
  ]);
  if (!["professional", "business"].includes(usage.plan.slug)) {
    redirect("/dashboard/teacher/courses");
  }
  if (!course) notFound();

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-4xl items-center px-6">
          <Button variant="ghost" render={<Link href="/dashboard/teacher/courses" />}>
            <ArrowLeft className="size-4" aria-hidden />
            Back to courses
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-6 py-10">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Edit course</p>
          <h1 className="text-3xl font-semibold tracking-tight">{course.title}</h1>
        </div>

        <CourseEditForm
          course={{
            id: course.id,
            slug: course.slug,
            title: course.title,
            description: course.description,
            coverImageUrl: course.coverImageUrl,
            priceCents: course.priceCents,
            currency: course.currency,
            level: course.level,
            status: course.status,
            subjectId: course.subjectId,
          }}
          subjects={subjects}
        />

        <CourseCurriculumEditor courseId={course.id} modules={course.modules} />
      </main>
    </div>
  );
}
