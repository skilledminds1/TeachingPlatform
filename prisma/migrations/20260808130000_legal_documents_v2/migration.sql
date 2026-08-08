-- Version 2.0 of the four binding documents, after the courses product was removed.
--
-- WHY NEW IDS AND NOT JUST A NEW VERSION STRING. `getMissingCurrentLegalDocuments` matches an
-- acceptance to a document by `document_id` alone (src/server/legal/acceptance.ts:40-48); the
-- version column is display-only. So bumping the string in place would have shown every user
-- "Version 2.0" while their acceptance of the 1.0 text silently kept counting. New rows with
-- new ids are what actually routes existing users back through /legal-review, which is the
-- correct outcome: the terms, refund policy and teacher agreement all changed materially —
-- course purchase, enrollment, content licensing and the 7-day/20%-consumed course refund rule
-- are gone, and the privacy inventory no longer lists course progress.
--
-- The 1.0 rows are superseded, never deleted. `legal_acceptances.document_id` is ON DELETE
-- RESTRICT precisely so historical acceptances keep pointing at the text that was accepted.
--
-- KNOWN DEFECT, NOT FIXED HERE. `content_hash` is the SHA-256 of the one-line `content` string
-- above it, not of the rendered document text — so it identifies a version label, not the words
-- anyone agreed to. That is carried forward unchanged rather than quietly altered, because
-- changing the hashing scheme is a separate change that has to migrate the 1.0 rows too.
-- Until it is fixed, these hashes are not evidence of what was accepted.

INSERT INTO "legal_documents" (
  "id", "type", "version", "audience", "title", "path", "content",
  "content_hash", "effective_at", "updated_at"
) VALUES
(
  '00000000-0000-4000-8000-000000000201',
  'terms',
  '2.0',
  'all',
  'Terms of Service',
  '/terms',
  'Amazing Skills Terms of Service version 2.0 effective 2026-08-08',
  'be22f58346cc13725c202f54433d7bfca404551a70c7c9ef9c9d42ccc6e94bb0',
  '2026-08-08T00:00:00.000Z',
  CURRENT_TIMESTAMP
),
(
  '00000000-0000-4000-8000-000000000202',
  'privacy',
  '2.0',
  'all',
  'Privacy Policy',
  '/privacy',
  'Amazing Skills Privacy Policy version 2.0 effective 2026-08-08',
  '5399327507c975327b4787dad399fd71724bd7afbfb9c295a7b12ca1f0ecf940',
  '2026-08-08T00:00:00.000Z',
  CURRENT_TIMESTAMP
),
(
  '00000000-0000-4000-8000-000000000203',
  'refund_policy',
  '2.0',
  'all',
  'Refund and Direct Payment Policy',
  '/refund-policy',
  'Amazing Skills Refund and Direct Payment Policy version 2.0 effective 2026-08-08',
  '0b54d74cf04f4311dc3814f827659cf2c5261b171c4061781dca1733245ef4ef',
  '2026-08-08T00:00:00.000Z',
  CURRENT_TIMESTAMP
),
(
  '00000000-0000-4000-8000-000000000204',
  'teacher_agreement',
  '2.0',
  'teacher',
  'Teacher Agreement',
  '/teacher-agreement',
  'Amazing Skills Teacher Agreement version 2.0 effective 2026-08-08',
  '1c894f23fd9ae6e90a2bc1900a6f86ceb0164b79192efe13948530d2dfcef58c',
  '2026-08-08T00:00:00.000Z',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

UPDATE "legal_documents"
SET "superseded_at" = '2026-08-08T00:00:00.000Z', "updated_at" = CURRENT_TIMESTAMP
WHERE "id" IN (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000103',
  '00000000-0000-4000-8000-000000000104'
)
AND "superseded_at" IS NULL;
