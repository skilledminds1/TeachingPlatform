import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * QLT-08. searchTeachers took exactly 60 profiles ordered by submittedAt, then applied the
 * minRating filter and the "rating" sort in memory over only those 60. Three failures, each
 * of which gets worse as the platform succeeds:
 *
 *   - teacher 61 onwards, the earliest-approved and so likely the best-reviewed, could never
 *     appear at all, because nothing anywhere paginated;
 *   - "sort by rating" returned the best of the 60 most recently submitted while looking
 *     exactly like it had returned the platform's best; and
 *   - minRating could return an empty page while matching teachers existed further down.
 *
 * A teacher who cannot be found churns from a paid plan, and paid plans are the platform's
 * only revenue.
 */
const QUERY = "src/server/marketplace/teachers.ts";
const AGGREGATES = "src/server/marketplace/aggregates.ts";
const PAGE = "src/app/find-tutor/page.tsx";
const MIGRATION =
  "prisma/migrations/20260802140000_qlt08_teacher_rating_aggregates/migration.sql";

function read(path: string): string {
  return readFileSync(path, "utf8").split("\r\n").join("\n");
}

/** Comments describe the old shapes, so strip them before matching. */
function code(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("the marketplace paginates", () => {
  it("no longer hard-caps the result set at 60", () => {
    expect(code(QUERY)).not.toContain("take: 60");
  });

  it("takes a page, skips to it, and counts the rest", () => {
    const text = code(QUERY);
    expect(text).toMatch(/take:\s*pageSize/);
    expect(text).toMatch(/skip:\s*\(page - 1\) \* pageSize/);
    expect(text).toMatch(/db\.teacherProfile\.count\(\{\s*where\s*\}\)/);
  });

  it("returns the totals a pager needs", () => {
    const text = code(QUERY);
    for (const field of ["total", "page", "pageSize", "pageCount"]) {
      expect(text).toContain(field);
    }
  });

  it("renders controls, or every later page stays unreachable", () => {
    const text = code(PAGE);
    expect(text).toContain("pageHref");
    expect(text).toContain('rel="next"');
    expect(text).toContain('rel="prev"');
  });

  /**
   * Losing the filters on page two would be its own bug: a student who narrowed to Spanish
   * under $30 would silently get everybody back.
   */
  it("carries the active filters across pages", () => {
    const text = code(PAGE);
    expect(text).toContain("URLSearchParams");
    expect(text).toMatch(/if \(key === "page"\) continue;/);
  });
});

describe("rating filtering and sorting happen in SQL", () => {
  it("filters minRating in the where clause", () => {
    const text = code(QUERY);
    expect(text).toMatch(/where\.ratingAverage = \{ gte: filters\.minRating \}/);
  });

  it("orders by the denormalised rating, unrated teachers last", () => {
    const text = code(QUERY);
    expect(text).toMatch(/ratingAverage:\s*\{\s*sort:\s*"desc",\s*nulls:\s*"last"\s*\}/);
  });

  it("no longer re-sorts or re-filters in memory afterwards", () => {
    const text = code(QUERY);
    expect(text).not.toContain("results.sort(");
    expect(text).not.toContain("results.filter(");
    // The per-page groupBy the aggregate replaced.
    expect(text).not.toContain("db.review.groupBy");
  });
});

describe("the rating column has one writer", () => {
  it("counts approved reviews only", () => {
    expect(read(AGGREGATES)).toMatch(/status:\s*"approved"/);
  });

  it("stores null rather than zero for an unreviewed teacher", () => {
    // Otherwise every new teacher sorts as though rated zero.
    expect(read(AGGREGATES)).toMatch(/ratingCount > 0 \? rating\._avg\.rating : null/);
  });

  /**
   * updateMany, not update: a reviewed user may have no teacher profile, and that should be
   * a no-op rather than a thrown "record not found" inside someone's review submission.
   */
  it("does not throw when the user has no teacher profile", () => {
    expect(read(AGGREGATES)).toContain("teacherProfile.updateMany");
  });

  it("is called when a review is submitted and when it is moderated", () => {
    for (const caller of ["src/actions/reviews.ts", "src/actions/admin.ts"]) {
      expect(
        read(caller).includes("recomputeTeacherAggregates"),
        `${caller} must keep the marketplace rating in step`,
      ).toBe(true);
    }
  });
});

describe("the migration backfills from the reviews it summarises", () => {
  it("uses the same rule as the runtime writer", () => {
    const sql = read(MIGRATION);
    expect(sql).toContain("WHERE \"status\" = 'approved'");
    expect(sql).toContain('"rating_average" = r.avg_rating');
  });

  it("joins reviews to profiles on the teacher's user id", () => {
    // Review.teacherId is a USER id, not a profile id — an easy and silent mistake.
    expect(read(MIGRATION)).toContain('p."user_id" = r."teacher_id"');
  });

  it("indexes the sort keys", () => {
    const sql = read(MIGRATION);
    expect(sql).toContain("teacher_profiles_status_rating_average_idx");
  });
});
