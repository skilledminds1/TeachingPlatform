import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * QLT-12(a). A course that sold 50 copies and refunded 40 advertised "50 students enrolled"
 * to the next buyer and ranked high under "popular" — the strongest endorsement the page can
 * make, assembled from the people who asked for their money back.
 *
 * These assertions read the source because the queries need a database to execute. That is
 * the same approach provider-flags.test.ts takes, and it catches the regression that matters:
 * someone reinstating a bare `enrollments: true` count.
 */
const QUERIES = "src/server/courses/queries.ts";

/**
 * Comments are stripped before matching. The file explains the old shapes in prose, and a
 * test that cannot tell an explanation from the code it warns about is worse than no test.
 */
function source(): string {
  return readFileSync(QUERIES, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("public enrollment counts exclude revoked enrollments", () => {
  it("never counts enrollments without a revokedAt filter", () => {
    const text = source();
    // `enrollments: true` inside a _count select is the unfiltered form.
    expect(
      /_count:\s*\{\s*select:\s*\{[^}]*\benrollments:\s*true\b/.test(text),
      "a _count select still counts enrollments unfiltered",
    ).toBe(false);
  });

  it("filters every enrollment count it still takes from the relation", () => {
    const text = source();
    const counts = text.match(/enrollments:\s*\{\s*where:\s*\{\s*revokedAt:\s*null\s*\}\s*\}/g);
    // Sales page, teacher list, moderation queue, admin review. The catalog card count
    // moved to Course.enrollmentCount in QLT-07 — see below.
    expect(counts?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  /**
   * QLT-07 replaced the catalog's relation count with a denormalised column, so the
   * "revoked must not count" rule moved with it. If recomputeCourseAggregates ever stops
   * filtering, every catalog card silently starts advertising refunded sales again — and
   * nothing else would notice.
   */
  it("keeps the rule when the count is denormalised", () => {
    const aggregates = readFileSync("src/server/courses/aggregates.ts", "utf8");
    expect(aggregates).toMatch(/courseEnrollment\.count\(\{[\s\S]*?revokedAt:\s*null/);
  });
});

describe("the popular sort does not rank by revoked enrollments", () => {
  /**
   * Prisma cannot order by a FILTERED relation count, so the old
   * `orderBy: { enrollments: { _count: "desc" } }` counted revocations and could not be
   * repaired in place. It is sorted after the fetch instead, as rating and price already are.
   */
  it("no longer orders by the unfiltered relation count in SQL", () => {
    expect(source()).not.toContain('enrollments: { _count: "desc" }');
  });

  /**
   * QLT-12 sorted popularity in application code because Prisma cannot order by a FILTERED
   * relation count. QLT-07 removed that constraint: enrollmentCount is a column that already
   * excludes revoked enrollments, so the planner can order by it directly.
   */
  it("orders by the denormalised active-enrollment count in SQL", () => {
    const text = source();
    expect(text).toMatch(/enrollmentCount:\s*"desc"/);
  });
});
