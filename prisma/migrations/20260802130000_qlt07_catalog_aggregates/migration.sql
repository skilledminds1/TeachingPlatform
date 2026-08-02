-- QLT-07 — Make the course catalog bounded.
--
-- searchPublishedCourses issued a findMany with no take and no skip, pulling EVERY published
-- course together with its full approved-review list and active sale joins, computed the
-- aggregates in JavaScript, filtered minRating, re-sorted for rating and price, and only
-- then sliced out a page of 24. At 5,000 courses averaging 20 reviews that is roughly
-- 100,000 review rows dragged over the pooled connection and discarded, on the
-- unauthenticated, crawler-visited /courses page — saturating the pool and taking bookings
-- and dashboards down with it.
--
-- WHY DENORMALISE RATHER THAN PAGINATE-THEN-AGGREGATE:
--
-- Aggregating only the current page would be simpler and needs no columns. It does not work
-- here, because `minRating` filters on the aggregate and `sort=rating` orders by it — both
-- decide WHICH rows are on the page, so they must be known before the page is chosen. The
-- aggregate has to live somewhere the planner can filter and sort on.
--
-- The cost is that these columns can go stale. recomputeCourseAggregates is the single
-- writer, called from every place a review or enrollment changes; the backfill below is the
-- same computation expressed in SQL, so a mismatch is a bug rather than a drift.
--
-- enrollment_count deliberately counts ACTIVE enrollments only. QLT-12 removed revoked
-- enrollments from every other count for the same reason: a course that sold 50 and refunded
-- 40 must not advertise 50.

ALTER TABLE "courses"
  ADD COLUMN "rating_average"   DECIMAL(3, 2),
  ADD COLUMN "rating_count"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "enrollment_count" INTEGER NOT NULL DEFAULT 0;

-- Backfill from the relations these columns replace.
UPDATE "courses" AS c
SET
  "rating_average" = r.avg_rating,
  "rating_count"   = r.rating_count
FROM (
  SELECT "course_id",
         ROUND(AVG("rating")::numeric, 2) AS avg_rating,
         COUNT(*)                         AS rating_count
  FROM "course_reviews"
  WHERE "status" = 'approved'
  GROUP BY "course_id"
) AS r
WHERE c."id" = r."course_id";

UPDATE "courses" AS c
SET "enrollment_count" = e.active_count
FROM (
  SELECT "course_id", COUNT(*) AS active_count
  FROM "course_enrollments"
  WHERE "revoked_at" IS NULL
  GROUP BY "course_id"
) AS e
WHERE c."id" = e."course_id";

-- The catalog's sort keys. Ordering happens in SQL over the whole catalog now, rather than
-- in JavaScript over a full in-memory copy of it.
CREATE INDEX "courses_status_published_at_idx"     ON "courses"("status", "published_at");
CREATE INDEX "courses_status_rating_average_idx"   ON "courses"("status", "rating_average");
CREATE INDEX "courses_status_enrollment_count_idx" ON "courses"("status", "enrollment_count");
CREATE INDEX "courses_status_price_cents_idx"      ON "courses"("status", "price_cents");

-- Text search. Prisma renders `contains` with `mode: "insensitive"` as ILIKE '%term%', which
-- is a sequential scan on every published course unless a trigram index can serve it. A
-- leading wildcard rules out a btree; GIN with gin_trgm_ops is the shape that works.
--
-- pg_trgm ships with Supabase. IF NOT EXISTS so this is safe to re-run and does not fail on
-- a database where it is already enabled.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "courses_title_trgm_idx"
  ON "courses" USING GIN ("title" gin_trgm_ops);

CREATE INDEX "courses_description_trgm_idx"
  ON "courses" USING GIN ("description" gin_trgm_ops);
