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
import { SiteFooter } from "@/features/marketing/components/site-footer";
import {
  getMarketplaceSubjects,
  searchTeachers,
  type TeacherSort,
} from "@/server/marketplace/teachers";

export const metadata: Metadata = {
  title: "Find a tutor",
  description:
    "Find verified tutors on Amazing Skills. Filter by subject, rate, and rating, then book a live lesson.",
  // GLO-02: every filter combination is a distinct URL serving near-identical content.
  // Without this they compete with each other and split the ranking signal.
  alternates: { canonical: "/find-tutor" },
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
  // QLT-08: without a page parameter the marketplace showed the first 60 teachers and no
  // way to reach any others.
  const pageParam = Number(first("page"));
  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.trunc(pageParam) : 1;
  const [user, subjects, results, fx] = await Promise.all([
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
      page,
    }),
    getConversionContext(),
  ]);

  const { teachers, total, pageCount } = results;

  /** Preserve every active filter when moving between pages. */
  const pageHref = (target: number): string => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key === "page") continue;
      if (typeof value === "string" && value) next.set(key, value);
    }
    if (target > 1) next.set("page", String(target));
    const queryString = next.toString();
    return queryString ? `/find-tutor?${queryString}` : "/find-tutor";
  };

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
            <nav aria-label="Account" className="flex items-center gap-2">
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
            </nav>
          </div>
        </header>
      )}
      <main id="main-content" className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Find a tutor</h1>
          <p className="text-muted-foreground">
            Every tutor is verified before appearing here. Lessons are live video, one on one.
          </p>
        </div>
        {/*
          GLO-03: the page was a single H1 with nothing below it, so heading navigation —
          how a screen-reader user skims a page — could not reach the filters or the results.
          The headings are visually hidden because the design already makes both obvious to
          anyone who can see them; the outline is what was missing, not the labels.
        */}
        <section aria-labelledby="filters-heading">
          <h2 id="filters-heading" className="sr-only">
            Filter tutors
          </h2>
          <Suspense>
            <TeacherFilters subjects={subjects} />
          </Suspense>
        </section>
        <h2 id="results-heading" className="sr-only">
          Tutors
        </h2>
        <p className="text-sm text-muted-foreground">
          {/*
            QLT-08: the TOTAL, not the length of this page. It used to read "60 tutors
            available" no matter how many there really were.
          */}
          {total} tutor{total === 1 ? "" : "s"} available
          {pageCount > 1 ? ` · page ${results.page} of ${pageCount}` : ""}
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

        {/*
          QLT-08: without these, everything past the first page is unreachable — which was
          the whole defect. Rendered as links so they work without JavaScript and so a
          crawler can follow them into the rest of the catalogue.
        */}
        {pageCount > 1 ? (
          <nav
            aria-label="Tutor pages"
            className="flex items-center justify-between gap-3 pt-2"
          >
            {results.page > 1 ? (
              <Link
                href={pageHref(results.page - 1)}
                className="rounded-lg border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
                rel="prev"
              >
                Previous
              </Link>
            ) : (
              <span />
            )}
            <span className="text-sm text-muted-foreground">
              Page {results.page} of {pageCount}
            </span>
            {results.page < pageCount ? (
              <Link
                href={pageHref(results.page + 1)}
                className="rounded-lg border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
                rel="next"
              >
                Next
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </main>
      <SiteFooter />
    </div>
  );
}
