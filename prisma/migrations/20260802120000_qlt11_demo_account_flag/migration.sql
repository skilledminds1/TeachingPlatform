-- QLT-11 — Replace the seed-domain coupling in the marketplace queries with a real flag.
--
-- searchTeachers and getTeacherBySlug — the two hottest public queries on the platform —
-- filtered with `user: { email: { not: { endsWith: "teachingplatform.local" } } }`. That
-- tied the marketplace to a seed-data naming convention, and it was wrong in four ways at
-- once:
--
--   * it silently hides any REAL user whose email happens to end that way;
--   * it does nothing for demo data seeded under a different domain, which is the only
--     reason the convention would ever change;
--   * it costs a join to users plus a string suffix scan on every marketplace request; and
--   * it defeats index-only strategies on teacher_profiles.
--
-- The intent — "this account is demo data, keep it out of the marketplace" — is a property
-- of the account. It is now stored as one.
--
-- BACKFILLED FROM THE CONVENTION IT REPLACES, so existing seeded accounts stay excluded.
-- This is the one moment where reading the email suffix is correct: it is a migration from
-- an implicit rule to an explicit one, not a query.

ALTER TABLE "users"
  ADD COLUMN "is_demo" BOOLEAN NOT NULL DEFAULT false;

UPDATE "users"
SET "is_demo" = true
WHERE lower("email") LIKE '%teachingplatform.local';

-- The marketplace filters on this for every listing query.
CREATE INDEX "users_is_demo_idx" ON "users"("is_demo");
