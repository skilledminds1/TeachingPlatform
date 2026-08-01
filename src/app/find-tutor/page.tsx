import { GraduationCap } from "lucide-react";
import { getConversionContext } from "@/server/fx/convert";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/features/admin/components/empty-state";
import { TeacherCard } from "@/features/marketplace/components/teacher-card";
import { TeacherFilters } from "@/features/marketplace/components/teacher-filters";
import { StudentNavWithNotifications } from "@/features/student-dashboard/components/student-nav-with-notifications";
import { getCurrentUser, hasTeacherMembership } from "@/server/auth/session";
import {
  getMarketplaceSubjects,
  searchTeachers,
  type TeacherSort,
} from "@/server/marketplace/teachers";

export const metadata: Metadata = {
  title: "Find a tutor",
  description:
    "Find verified tutors on Amazing Skills. Filter by subject, rate, and rating, then book a live lesson.",
};

const validSorts = new Set(["recommended", "price_asc", "price_desc", "rating", "newest"]);

export default async function FindTutorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const first = (key: string): string | undefined => {
    const value = params[key];
    return typeof value === "string" && value ? value : undefined;
  };

  const maxRate = Number(first("maxRate"));
  const minRating = Number(first("minRating"));
  const sortParam = first("sort");
  const [user, subjects, teachers, fx] = await Promise.all([
    getCurrentUser(),
    getMarketplaceSubjects(),
    searchTeachers({
      query: first("q"),
      subject: first("subject"),
      language: first("language"),
      maxRateCents: Number.isFinite(maxRate) && maxRate > 0 ? maxRate : undefined,
      minRating: Number.isFinite(minRating) && minRating > 0 ? minRating : undefined,
      sort:
        sortParam && validSorts.has(sortParam) ? (sortParam as TeacherSort) : "recommended",
    }),
    getConversionContext(),
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
          <h1 className="text-3xl font-semibold tracking-tight">Find a tutor</h1>
          <p className="text-muted-foreground">
            Every tutor is verified before appearing here. Lessons are live video, one on one.
          </p>
        </div>
        <Suspense>
          <TeacherFilters subjects={subjects} />
        </Suspense>
        <p className="text-sm text-muted-foreground">
          {teachers.length} tutor{teachers.length === 1 ? "" : "s"} available
        </p>
        {teachers.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {teachers.map((teacher) => (
              <TeacherCard fxRates={fx.rates} fxStale={fx.stale} key={teacher.id} teacher={teacher} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <EmptyState
              icon={GraduationCap}
              title="No tutors match these filters"
              description="Try clearing a filter or searching for a different subject. New tutors join after admin approval."
            />
          </div>
        )}
      </main>
    </div>
  );
}
