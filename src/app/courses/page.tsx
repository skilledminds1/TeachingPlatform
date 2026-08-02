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
import { getTranslations } from "next-intl/server";

import { SiteFooter } from "@/features/marketing/components/site-footer";

export const metadata: Metadata = {
  title: "Courses",
  description:
    "Browse self-paced courses from verified teachers on Amazing Skills.",
  // GLO-02: as with /find-tutor, the filtered variants consolidate onto the bare path.
  alternates: { canonical: "/courses" },
};

const validLevels = new Set<CourseLevel>([
  "beginner",
  "intermediate",
  "advanced",
  "all_levels",
]);

const validSorts = new Set<CourseSort>(["newest", "price_asc", "price_desc", "popular", "rating"]);

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("coursesPage");
  const tNav = await getTranslations("nav");
  const params = await searchParams;
  const first = (key: string): string | undefined => {
    const value = params[key];
    return typeof value === "string" && value ? value : undefined;
  };

  const maxPrice = Number(first("maxPrice"));
  const minRating = Number(first("minRating"));
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
      minRating: Number.isFinite(minRating) && minRating > 0 ? minRating : undefined,
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
            {/* GLO-03: a navigation landmark, so it can be jumped to rather than tabbed past. */}
            <nav aria-label={tNav("accountNavLabel")} className="flex items-center gap-2">
              <Button variant="ghost" render={<Link href="/find-tutor" />}>
                {t("tutors")}
              </Button>
              {user ? (
                <Button variant="ghost" render={<Link href="/dashboard" />}>
                  {tNav("dashboard")}
                </Button>
              ) : (
                <>
                  <Button variant="ghost" render={<Link href="/login" />}>
                    {tNav("signIn")}
                  </Button>
                  <Button render={<Link href="/register" />}>{tNav("getStarted")}</Button>
                </>
              )}
            </nav>
          </div>
        </header>
      )}

      <main id="main-content" className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>

        {/* GLO-03: see /find-tutor — heading navigation could not reach either region. */}
        <section aria-labelledby="filters-heading">
          <h2 id="filters-heading" className="sr-only">
            {t("filtersHeading")}
          </h2>
          <Suspense>
            <CourseFilters subjects={subjects} />
          </Suspense>
        </section>

        <h2 id="results-heading" className="sr-only">
          {t("resultsHeading")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("courseCount", { count: result.total })}
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
              title={t("emptyTitle")}
              description={t("emptyBody")}
            />
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
