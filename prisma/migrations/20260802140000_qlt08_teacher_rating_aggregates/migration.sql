-- QLT-08 — Make the teacher marketplace paginate, and make its rating filter and sort real.
--
-- searchTeachers took exactly 60 profiles ordered by submitted_at DESC, then applied the
-- minRating filter and the "rating" sort in memory over only those 60. Three consequences,
-- all of which get worse as the platform succeeds:
--
--   * teacher 61 onwards — the earliest-approved, and so likely the best-reviewed — could
--     never appear in the default listing at all, because there was no pagination anywhere;
--   * "sort by rating" returned the best of the 60 most recently submitted, not the
--     platform's best, while looking exactly like it had done the right thing; and
--   * minRating could return an empty page while plenty of matching teachers existed.
--
-- A teacher who cannot be found churns from a paid plan, and paid plans are the platform's
-- only revenue — so this is a discovery bug with a direct line to the income statement.
--
-- Same shape as QLT-07: the aggregate has to exist before the page is chosen, because it
-- decides WHICH teachers are on it. recomputeTeacherAggregates is the single writer, called
-- when a review is created and when it is moderated; the backfill below is that same
-- computation in SQL.

ALTER TABLE "teacher_profiles"
  ADD COLUMN "rating_average" DECIMAL(3, 2),
  ADD COLUMN "rating_count"   INTEGER NOT NULL DEFAULT 0;

-- Backfill from the reviews these columns summarise. Reviews are keyed by the teacher's USER
-- id, which is what teacher_profiles.user_id holds.
UPDATE "teacher_profiles" AS p
SET
  "rating_average" = r.avg_rating,
  "rating_count"   = r.rating_count
FROM (
  SELECT "teacher_id",
         ROUND(AVG("rating")::numeric, 2) AS avg_rating,
         COUNT(*)                         AS rating_count
  FROM "reviews"
  WHERE "status" = 'approved'
  GROUP BY "teacher_id"
) AS r
WHERE p."user_id" = r."teacher_id";

-- The marketplace's sort keys, applied in SQL over every approved teacher now.
CREATE INDEX "teacher_profiles_status_rating_average_idx"
  ON "teacher_profiles"("status", "rating_average");

CREATE INDEX "teacher_profiles_status_submitted_at_idx"
  ON "teacher_profiles"("status", "submitted_at");
