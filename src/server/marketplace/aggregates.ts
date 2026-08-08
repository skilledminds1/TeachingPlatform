import { db, type DbTransactionClient } from "@/lib/db";
import { logger } from "@/lib/observability/logger";

/**
 * The single writer for TeacherProfile.ratingAverage and ratingCount (QLT-08).
 *
 * The marketplace needs a teacher's rating BEFORE it decides which page they are on —
 * minRating filters on it and "sort by rating" orders by it — so the aggregate cannot be
 * computed from the rows that came back. The staleness trade is accepted deliberately: a
 * rating can lag a moderation decision by the length of one write, which is cheaper than
 * making every marketplace page aggregate the whole review table.
 *
 * Called wherever a review changes: when one is submitted, and when it is moderated. The
 * second is the decisive one, since only approved reviews count. The backfill in the QLT-08
 * migration is this computation written in SQL, so the two can be compared when a number
 * looks wrong.
 *
 * Takes the teacher's USER id, which is what Review.teacherId holds and what
 * TeacherProfile.userId joins on.
 */
export async function recomputeTeacherAggregates(
  teacherUserId: string,
  client: DbTransactionClient | typeof db = db,
): Promise<void> {
  const rating = await client.review.aggregate({
    where: { teacherId: teacherUserId, status: "approved" },
    _avg: { rating: true },
    _count: { _all: true },
  });

  const ratingCount = rating._count._all;

  // updateMany rather than update: a user may have no teacher profile, and this should be a
  // no-op in that case rather than a thrown "record not found".
  await client.teacherProfile.updateMany({
    where: { userId: teacherUserId },
    data: {
      // Null rather than zero for an unreviewed teacher: "unrated" and "rated zero" are
      // different, and only one of them belongs at the bottom of a rating sort.
      ratingAverage: ratingCount > 0 ? rating._avg.rating : null,
      ratingCount,
    },
  });
}

/**
 * Recompute without letting a failure take down whatever triggered it.
 *
 * A stale marketplace rating is cosmetic; a review submission that throws because a
 * denormalised column could not be written is not.
 */
export async function recomputeTeacherAggregatesSafely(
  teacherUserId: string,
  client: DbTransactionClient | typeof db = db,
): Promise<void> {
  try {
    await recomputeTeacherAggregates(teacherUserId, client);
  } catch (error) {
    logger.error("teacher_aggregates_recompute_failed", {
      teacherUserId,
      error: String(error),
    });
  }
}
