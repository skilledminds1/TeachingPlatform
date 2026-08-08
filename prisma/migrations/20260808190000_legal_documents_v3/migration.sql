-- Version 3.0 of the binding documents: under-18 students are now permitted.
--
-- The Terms said "You must be at least 18 years old" and the Privacy Policy said "We do not
-- knowingly create accounts for children". Both are now false, and both were load-bearing
-- claims on pages that exist to be trusted. Version 3.0 states the actual position: teachers
-- must be adults, students under 18 need a parent or guardian's permission, and it says
-- plainly what the mechanism does NOT establish — no identity verification, no relationship
-- check, no background checks on teachers, no monitoring of lessons.
--
-- New ids for the same reason as v2: acceptance is matched on document_id alone and the
-- version column is display-only, so bumping the string in place would leave every existing
-- acceptance silently covering text nobody agreed to.

INSERT INTO "legal_documents" (
  "id", "type", "version", "audience", "title", "path", "content",
  "content_hash", "effective_at", "updated_at"
) VALUES
(
  '00000000-0000-4000-8000-000000000301',
  'terms',
  '3.0',
  'all',
  'Terms of Service',
  '/terms',
  'Amazing Skills Terms of Service version 3.0 effective 2026-08-08',
  '8f145fe0c0fd6a2244cc427dc6ea3be61f3f0f88688a2c07afbaf4fd4c1d3a20',
  '2026-08-08T00:00:00.000Z',
  CURRENT_TIMESTAMP
),
(
  '00000000-0000-4000-8000-000000000302',
  'privacy',
  '3.0',
  'all',
  'Privacy Policy',
  '/privacy',
  'Amazing Skills Privacy Policy version 3.0 effective 2026-08-08',
  'b658a7371c9d7724d99f51e65a56a9413baabd86373c9e97720f2e2c12d72d63',
  '2026-08-08T00:00:00.000Z',
  CURRENT_TIMESTAMP
),
(
  '00000000-0000-4000-8000-000000000303',
  'refund_policy',
  '3.0',
  'all',
  'Refund and Direct Payment Policy',
  '/refund-policy',
  'Amazing Skills Refund and Direct Payment Policy version 3.0 effective 2026-08-08',
  '99bc5c765112f7da9fa04a588782c11818d77ae7765d86b21b71b691b346f703',
  '2026-08-08T00:00:00.000Z',
  CURRENT_TIMESTAMP
),
(
  '00000000-0000-4000-8000-000000000304',
  'teacher_agreement',
  '3.0',
  'teacher',
  'Teacher Agreement',
  '/teacher-agreement',
  'Amazing Skills Teacher Agreement version 3.0 effective 2026-08-08',
  '506ab3218c8d5f9f57075f55e113b23e7966b7c5a5ef45cf395d4b71733e8593',
  '2026-08-08T00:00:00.000Z',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

UPDATE "legal_documents"
SET "superseded_at" = '2026-08-08T00:00:00.000Z', "updated_at" = CURRENT_TIMESTAMP
WHERE "version" = '2.0' AND "superseded_at" IS NULL;
