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

  it("filters every enrollment count it does take", () => {
    const text = source();
    const counts = text.match(/enrollments:\s*\{\s*where:\s*\{\s*revokedAt:\s*null\s*\}\s*\}/g);
    // Catalog cards, sales page, teacher list, moderation queue, admin review.
    expect(counts?.length ?? 0).toBeGreaterThanOrEqual(5);
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

  it("sorts popularity in application code, where the count is already filtered", () => {
    const text = source();
    expect(text).toContain('filters.sort === "popular"');
    // It must sort by the count that came back, not re-derive one.
    expect(text).toMatch(/b\._count\.enrollments\s*-\s*a\._count\.enrollments/);
  });
});
