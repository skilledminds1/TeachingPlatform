-- Remember the URLs a teacher profile used to answer on.
--
-- The slug is built from the teacher's name once, when the profile is created, and never
-- rebuilt. A teacher who corrects their display name therefore keeps a URL that states the
-- old one forever — which is exactly what happened to the first profile on the platform,
-- listed as "wesley(teacher)" and reachable at /find-tutor/wesley-teacher-55648c8b.
--
-- Renaming the slug fixes the URL and breaks every link anyone already holds, including the
-- sitemap entry a search engine indexed. Keeping the old value here lets the profile route
-- answer on it and redirect permanently to the current one, so a rename costs nothing.

ALTER TABLE "teacher_profiles"
  ADD COLUMN "previous_slugs" TEXT[] NOT NULL DEFAULT '{}';

-- A profile is found by exact slug first, so this only ever serves the fallback lookup.
CREATE INDEX "teacher_profiles_previous_slugs_idx" ON "teacher_profiles" USING GIN ("previous_slugs");
