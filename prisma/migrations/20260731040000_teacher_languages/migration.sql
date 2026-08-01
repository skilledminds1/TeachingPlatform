-- INT-10 — Languages a teacher can teach in.
--
-- There was no language field anywhere in the schema. For an international marketplace this
-- is the primary axis students search on: italki is organised entirely around it, and for
-- subject tutoring it decides whether a lesson is possible at all. A student could filter by
-- subject and price and still land on a teacher with no shared language.
--
-- Codes are BCP-47 ("en", "pt-BR"), so display names come from Intl.DisplayNames in the
-- user's own locale rather than a translation table we would have to maintain.

CREATE TYPE "language_proficiency" AS ENUM ('native', 'fluent', 'advanced', 'conversational');

CREATE TABLE "teacher_languages" (
    "teacher_profile_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "proficiency" "language_proficiency" NOT NULL DEFAULT 'conversational',

    CONSTRAINT "teacher_languages_pkey" PRIMARY KEY ("teacher_profile_id","code")
);

-- Marketplace filtering is by code, across all teachers.
CREATE INDEX "teacher_languages_code_idx" ON "teacher_languages"("code");

ALTER TABLE "teacher_languages"
  ADD CONSTRAINT "teacher_languages_teacher_profile_id_fkey"
  FOREIGN KEY ("teacher_profile_id") REFERENCES "teacher_profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing approved profile is assumed to teach in English, which is the
-- language the platform itself is in and the only one it has ever implied. Without this,
-- adding a language filter would make every current teacher invisible the moment a student
-- uses it. Teachers can correct this from their profile.
INSERT INTO "teacher_languages" ("teacher_profile_id", "code", "proficiency")
SELECT "id", 'en', 'fluent' FROM "teacher_profiles"
ON CONFLICT DO NOTHING;
