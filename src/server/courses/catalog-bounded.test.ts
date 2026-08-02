import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * QLT-07. searchPublishedCourses issued a findMany with no take and no skip, pulling EVERY
 * published course along with its full approved-review list, computed aggregates in
 * JavaScript, filtered minRating, re-sorted, and only then sliced out 24 rows.
 *
 * At 5,000 courses averaging 20 reviews that is ~100,000 review rows dragged over the pooled
 * connection and discarded, on the unauthenticated page crawlers hit hardest — saturating the
 * pool and taking bookings and dashboards down with it.
 *
 * The regression to guard is a return to app-side filtering or sorting, because it works
 * perfectly on a small catalog and only fails once there is one worth having.
 */
const QUERIES = "src/server/courses/queries.ts";
const AGGREGATES = "src/server/courses/aggregates.ts";
const MIGRATION =
  "prisma/migrations/20260802130000_qlt07_catalog_aggregates/migration.sql";

/** Normalised, so an assertion spanning lines does not depend on the repo's CRLF endings. */
function read(path: string): string {
  return readFileSync(path, "utf8").split("\r\n").join("\n");
}

/** Comments explain the old shapes; a matcher that cannot tell them apart is useless. */
function code(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("the catalog query is bounded", () => {
  it("takes a page and skips to it, rather than fetching everything", () => {
    const text = code(QUERIES);
    expect(text).toMatch(/take:\s*pageSize/);
    expect(text).toMatch(/skip:\s*\(page - 1\) \* pageSize/);
  });

  it("counts separately instead of measuring an in-memory array", () => {
    const text = code(QUERIES);
    expect(text).toMatch(/db\.course\.count\(\{\s*where\s*\}\)/);
    // The old total came from the length of the fully-materialised result.
    expect(text).not.toContain("const total = filtered.length");
  });

  it("no longer loads every approved review to compute an average", () => {
    const text = code(QUERIES);
    expect(text).not.toContain("course.reviews.reduce");
    expect(text).not.toContain("course.reviews.length");
  });

  it("bounds the review lists it does render", () => {
    const text = code(QUERIES);
    const bounded = text.match(/take:\s*PUBLIC_REVIEW_PAGE_SIZE/g);
    expect(bounded?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});

describe("filtering and ordering happen in SQL", () => {
  it("filters minRating in the where clause", () => {
    const text = code(QUERIES);
    expect(text).toMatch(/ratingAverage:\s*\{\s*gte:\s*filters\.minRating\s*\}/);
    expect(text).not.toContain("(course.ratingAverage ?? 0) >= filters.minRating");
  });

  it("orders rating and popularity by column", () => {
    const text = code(QUERIES);
    expect(text).toMatch(/ratingAverage:\s*\{\s*sort:\s*"desc",\s*nulls:\s*"last"\s*\}/);
    expect(text).toMatch(/enrollmentCount:\s*"desc"/);
  });

  /**
   * Sale-adjusted price genuinely does not exist in the database, so this one stays in
   * application code. It only reorders within a page that SQL already chose — which is the
   * distinction that matters, and the reason the comment beside it has to survive.
   */
  it("keeps only the sale-adjusted price sort in application code", () => {
    const text = code(QUERIES);
    expect(text).toContain("effectivePriceCents");
    expect(text).not.toContain('filters.sort === "rating"');
  });
});

describe("the denormalised columns have exactly one writer", () => {
  it("computes rating from approved reviews and enrollments that are not revoked", () => {
    const text = read(AGGREGATES);
    expect(text).toMatch(/status:\s*"approved"/);
    expect(text).toMatch(/revokedAt:\s*null/);
  });

  /**
   * "Unrated" and "rated zero" are different things, and only one of them should sort last.
   */
  it("stores null rather than zero when nothing has been reviewed", () => {
    expect(read(AGGREGATES)).toMatch(/ratingCount > 0 \? rating\._avg\.rating : null/);
  });

  it("is called from every place a review or enrollment changes", () => {
    const callers = [
      "src/actions/course-quality.ts", // a review is written
      "src/actions/admin.ts", // a review is approved or rejected
      "src/actions/payments.ts", // an enrollment is granted
      "src/server/payments/confirm.ts", // granted on confirmation, revoked on refund
    ];
    for (const caller of callers) {
      expect(
        read(caller).includes("recomputeCourseAggregates"),
        `${caller} must keep the catalog aggregates in step`,
      ).toBe(true);
    }
  });
});

describe("the migration backfills rather than starting from zero", () => {
  it("derives both aggregates from the relations they replace", () => {
    const sql = read(MIGRATION);
    expect(sql).toContain('SET\n  "rating_average"');
    expect(sql).toContain('"enrollment_count" = e.active_count');
    // Same rules as the runtime writer, or the backfill disagrees with every later update.
    expect(sql).toContain("WHERE \"status\" = 'approved'");
    expect(sql).toContain('WHERE "revoked_at" IS NULL');
  });

  it("indexes what the catalog orders and searches by", () => {
    const sql = read(MIGRATION);
    expect(sql).toContain("courses_status_rating_average_idx");
    expect(sql).toContain("courses_status_enrollment_count_idx");
    // ILIKE '%term%' cannot use a btree; GIN with trigram ops is the shape that works.
    expect(sql).toContain("gin_trgm_ops");
  });
});
