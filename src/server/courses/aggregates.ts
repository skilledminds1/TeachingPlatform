import { db, type DbTransactionClient } from "@/lib/db";
import { logger } from "@/lib/observability/logger";

/**
 * The single writer for Course.ratingAverage, ratingCount and enrollmentCount (QLT-07).
 *
 * These columns exist so the catalog can filter and sort on an aggregate without loading
 * every review for every published course on each request. That speed is bought with a
 * staleness risk, and the only thing that keeps the risk small is that exactly one function
 * computes them, called from every place the underlying rows change:
 *
 *   - a review is written or edited          (submitCourseReview)
 *   - a review is approved or rejected       (moderateCourseReview)
 *   - an enrollment is granted                (course purchase confirmation)
 *   - an enrollment is revoked                (refund)
 *
 * If you add a fifth, call this from it. The backfill in the QLT-07 migration is the same
 * computation written in SQL, so the two can be compared directly when something looks off.
 */
export async function recomputeCourseAggregates(
  courseId: string,
  client: DbTransactionClient | typeof db = db,
): Promise<void> {
  // Only APPROVED reviews count, matching what the public page has always displayed.
  const rating = await client.courseReview.aggregate({
    where: { courseId, status: "approved" },
    _avg: { rating: true },
    _count: { _all: true },
  });

  // Active enrollments only. QLT-12: a course that sold 50 and refunded 40 must not
  // advertise 50, here or anywhere else.
  const enrollmentCount = await client.courseEnrollment.count({
    where: { courseId, revokedAt: null },
  });

  const ratingCount = rating._count._all;

  await client.course.update({
    where: { id: courseId },
    data: {
      // Null rather than zero when nobody has reviewed: "unrated" and "rated zero" are
      // different things, and only one of them should sort last.
      ratingAverage: ratingCount > 0 ? rating._avg.rating : null,
      ratingCount,
      enrollmentCount,
    },
  });
}

/**
 * Recompute without letting a failure take down the operation that triggered it.
 *
 * A stale count is a cosmetic problem; a refund that throws because a catalog statistic
 * could not be written is not. Used on paths where the aggregate is a side effect rather
 * than the point.
 */
export async function recomputeCourseAggregatesSafely(
  courseId: string,
  client: DbTransactionClient | typeof db = db,
): Promise<void> {
  try {
    await recomputeCourseAggregates(courseId, client);
  } catch (error) {
    logger.error("course_aggregates_recompute_failed", { courseId, error: String(error) });
  }
}
