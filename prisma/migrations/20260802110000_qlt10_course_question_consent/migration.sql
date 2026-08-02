-- QLT-10 — Course Q&A was republished publicly without the student's consent.
--
-- askCourseQuestion stored every question with hidden=false, and the public course sales
-- page rendered the body verbatim for any answered, unhidden question. The composer said
-- only "Ask the teacher about course material" and the toast said "Question sent to your
-- teacher" — nothing anywhere said "and this will appear on a public, SEO-indexed page".
-- Publication was the silent default. A student asking something personal in a
-- mental-health or personal-finance course found it published, with no control.
--
-- WHY A NEW COLUMN RATHER THAN FLIPPING hidden's DEFAULT:
--
-- `hidden` is a MODERATION flag — teachers and admins hide and restore questions through
-- setCourseQuestionHidden. Reusing it for consent would tangle two unrelated decisions: a
-- teacher restoring a moderated question would simultaneously publish one the student never
-- agreed to share. Publication now requires is_public AND NOT hidden, and the two controls
-- belong to two different people.
--
-- DELIBERATELY NOT BACKFILLED TO TRUE.
--
-- Every existing question was published without consent, so defaulting them to false
-- retroactively unpublishes them. That is the point: the alternative preserves the defect
-- for exactly the data that is already exposed. Existing Q&A disappears from public course
-- pages until each student opts in, which is the correct direction for a consent bug.

ALTER TABLE "course_questions"
  ADD COLUMN "is_public" BOOLEAN NOT NULL DEFAULT false;

-- The public query filters course + is_public + hidden and orders by created_at.
DROP INDEX IF EXISTS "course_questions_course_id_hidden_created_at_idx";

CREATE INDEX "course_questions_course_id_is_public_hidden_created_at_idx"
  ON "course_questions"("course_id", "is_public", "hidden", "created_at");
