import { BookOpen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/features/admin/components/empty-state";
import { formatCourseLevel } from "@/features/courses/lib/labels";
import { StudentNavWithNotifications } from "@/features/student-dashboard/components/student-nav-with-notifications";
import { getCurrentUser } from "@/server/auth/session";
import { getStudentEnrollments } from "@/server/courses/queries";

export const metadata: Metadata = { title: "My learning" };

export default async function StudentCoursesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/dashboard/courses");

  const enrollments = await getStudentEnrollments(user.id);

  return (
    <div className="min-h-screen bg-muted/20">
      <StudentNavWithNotifications />

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">My learning</h1>
            <p className="text-sm text-muted-foreground">
              Continue purchased courses and track your lesson progress.
            </p>
          </div>
          <Button variant="outline" render={<Link href="/courses" />}>
            Browse courses
          </Button>
        </div>

        {enrollments.length > 0 ? (
          <ul className="grid gap-4 sm:grid-cols-2">
            {enrollments.map((enrollment) => {
              const lessons = enrollment.course.modules.flatMap((module) => module.lessons);
              const completed = lessons.filter((lesson) => lesson.progress.length > 0).length;
              return (
                <li key={enrollment.id}>
                  <Link
                    href={`/dashboard/courses/${enrollment.course.id}`}
                    className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-colors hover:border-primary/40"
                  >
                    <div className="aspect-[16/9] bg-muted">
                      {enrollment.course.coverImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={enrollment.course.coverImageUrl}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="flex flex-1 flex-col gap-2 p-5">
                      <p className="font-semibold leading-snug">{enrollment.course.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatCourseLevel(enrollment.course.level)} ·{" "}
                        {enrollment.course.teacher.name}
                      </p>
                      <p className="mt-auto pt-2 text-xs text-muted-foreground">
                        {completed} / {lessons.length} lessons complete
                        {enrollment.course.certificates.length > 0
                          ? " · Certificate earned"
                          : ""}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <EmptyState
              icon={BookOpen}
              title="No enrolled courses yet"
              description="Browse the course marketplace to find a self-paced course and start learning."
            />
            <div className="flex justify-center pb-8">
              <Button render={<Link href="/courses" />}>Browse courses</Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
