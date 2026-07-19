import { BookOpen, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/features/admin/components/empty-state";
import { StatusBadge } from "@/features/admin/components/status-badge";
import { CourseListActions } from "@/features/courses/components/course-list-actions";
import { courseStatusTone, formatCourseLevel } from "@/features/courses/lib/labels";
import { formatCurrency, formatStatus } from "@/lib/format";
import { getCourseUsage } from "@/server/billing/entitlements";
import { getTeacherCourses } from "@/server/courses/queries";
import { getTeacherProfileReadiness } from "@/server/teachers/onboarding";

export const metadata: Metadata = { title: "My courses" };

export default async function TeacherCoursesPage() {
  const readiness = await getTeacherProfileReadiness();
  const { user, profile, profileComplete } = readiness;

  if (!profile || !profileComplete || profile.status === "rejected") {
    redirect("/onboarding/teacher");
  }

  const [courses, usage] = await Promise.all([
    getTeacherCourses(user.id),
    getCourseUsage(profile.organizationId),
  ]);
  const canAuthorCourses = ["professional", "business"].includes(usage.plan.slug);

  return (
    <div className="min-h-screen bg-muted/20">
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">My Courses</h1>
            <p className="text-sm text-muted-foreground">
              {usage.courseCount}
              {usage.limit === null ? "" : ` / ${usage.limit}`} course
              {usage.courseCount === 1 ? "" : "s"} on your {usage.plan.name} plan
            </p>
          </div>
        </div>

        {!canAuthorCourses ? (
          <div className="flex flex-col gap-4 rounded-xl border border-primary/30 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">
                Course creation is available on Professional and Business.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Upgrade to sell unlimited self-paced courses with zero platform commission.
              </p>
            </div>
            <Button render={<Link href="/dashboard/teacher/billing" />}>
              Upgrade plan
            </Button>
          </div>
        ) : usage.atLimit ? (
          <div className="flex flex-col gap-4 rounded-xl border border-primary/30 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">
                You&apos;ve reached the limit of {usage.limit} course
                {usage.limit === 1 ? "" : "s"}.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Upgrade to {usage.recommendedPlan?.name ?? "the next plan"} to create more.
              </p>
            </div>
            <Button render={<Link href="/dashboard/teacher/billing" />}>
              Upgrade plan
            </Button>
          </div>
        ) : null}

        {courses.length > 0 ? (
          <ul className="space-y-3">
            {courses.map((course) => (
              <li key={course.id}>
                <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/dashboard/teacher/courses/${course.id}`}
                        className="truncate font-semibold hover:text-primary"
                      >
                        {course.title}
                      </Link>
                      <StatusBadge tone={courseStatusTone(course.status)}>
                        {formatStatus(course.status)}
                      </StatusBadge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatCourseLevel(course.level)}
                      {course.subject ? ` · ${course.subject.name}` : ""}
                      {" · "}
                      {course._count.modules} module
                      {course._count.modules === 1 ? "" : "s"}
                      {" · "}
                      {course._count.enrollments} student
                      {course._count.enrollments === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 sm:justify-end">
                    <p className="shrink-0 font-semibold">
                      {course.priceCents === 0
                        ? "Free"
                        : formatCurrency(course.priceCents, course.currency)}
                    </p>
                    <CourseListActions
                      courseId={course.id}
                      courseTitle={course.title}
                      canRemove={
                        course._count.enrollments === 0 && course._count.purchases === 0
                      }
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <EmptyState
              icon={BookOpen}
              title="No courses yet"
              description="Create your first self-paced course, then add modules and lessons before publishing."
            />
            <div className="flex justify-center pb-8">
              {!canAuthorCourses || usage.atLimit ? (
                <Button disabled>
                  <Plus className="size-4" aria-hidden />
                  Create course
                </Button>
              ) : (
                <Button render={<Link href="/dashboard/teacher/courses/new" />}>
                  <Plus className="size-4" aria-hidden />
                  Create course
                </Button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
