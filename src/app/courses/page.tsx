import { BookOpen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { CourseLevel } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/features/admin/components/empty-state";
import { CourseCard } from "@/features/courses/components/course-card";
import { CourseFilters } from "@/features/courses/components/course-filters";
import { StudentNavWithNotifications } from "@/features/student-dashboard/components/student-nav-with-notifications";
import { getCurrentUser, hasTeacherMembership } from "@/server/auth/session";
import {
  searchPublishedCourses,
  type CourseSort,
} from "@/server/courses/queries";
import { getMarketplaceSubjects } from "@/server/marketplace/teachers";

export const metadata: Metadata = {
  title: "Courses",
  description:
    "Browse self-paced courses from verified teachers on Amazing Skills.",
};

const validLevels = new Set<CourseLevel>([
  "beginner",
  "intermediate",
  "advanced",
  "all_levels",
]);

const validSorts = new Set<CourseSort>(["newest", "price_asc", "price_desc", "popular"]);

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const first = (key: string): string | undefined => {
    const value = params[key];
    return typeof value === "string" && value ? value : undefined;
  };

  const maxPrice = Number(first("maxPrice"));
  const levelParam = first("level");
  const sortParam = first("sort");

  const [user, subjects, result] = await Promise.all([
    getCurrentUser(),
    getMarketplaceSubjects(),
    searchPublishedCourses({
      query: first("q"),
      subjectSlug: first("subject"),
      level:
        levelParam && validLevels.has(levelParam as CourseLevel)
          ? (levelParam as CourseLevel)
          : undefined,
      maxPriceCents: Number.isFinite(maxPrice) && maxPrice > 0 ? maxPrice : undefined,
      sort:
        sortParam && validSorts.has(sortParam as CourseSort)
          ? (sortParam as CourseSort)
          : "newest",
    }),
  ]);
  const showStudentNav =
    Boolean(user) && !user?.isPlatformAdmin && !hasTeacherMembership(user!);

  return (
    <div className="min-h-screen bg-muted/20">
      {showStudentNav ? (
        <StudentNavWithNotifications />
      ) : (
        <header className="border-b border-border bg-background">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
            <Link href="/" className="font-semibold tracking-tight">
              Amazing Skills
            </Link>
            <div className="flex items-center gap-2">
              <Button variant="ghost" render={<Link href="/find-tutor" />}>
                Tutors
              </Button>
              {user ? (
                <Button variant="ghost" render={<Link href="/dashboard" />}>
                  Dashboard
                </Button>
              ) : (
                <>
                  <Button variant="ghost" render={<Link href="/login" />}>
                    Sign in
                  </Button>
                  <Button render={<Link href="/register" />}>Get started</Button>
                </>
              )}
            </div>
          </div>
        </header>
      )}

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Browse courses</h1>
          <p className="text-muted-foreground">
            Self-paced courses with downloadable materials from verified teachers.
          </p>
        </div>

        <Suspense>
          <CourseFilters subjects={subjects} />
        </Suspense>

        <p className="text-sm text-muted-foreground">
          {result.total} course{result.total === 1 ? "" : "s"} available
        </p>

        {result.courses.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {result.courses.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <EmptyState
              icon={BookOpen}
              title="No courses match these filters"
              description="Try clearing a filter or searching for a different subject. New courses appear when teachers publish them."
            />
          </div>
        )}
      </main>
    </div>
  );
}
