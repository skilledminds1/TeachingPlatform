-- Version 4.0: the operator is a company, and was never the sole proprietor these documents named.
--
-- Until now every one of these pages told the reader they were contracting with "Wesley Horak,
-- trading as Amazing Skills (sole proprietor)", and stated "Sole proprietor (no company
-- registration)". The platform is in fact operated by SKILLED MINDS (PTY) LTD, registration
-- 2025/384924/07, incorporated 16 May 2025 with two directors. A sole proprietorship has no
-- shareholders, so the previous description could not have been right once shares existed.
--
-- The identity of the counterparty is not a detail on a contract, it IS the contract's other
-- side, so this is a material change and not a typo fix. New ids force everyone back through
-- /legal-review: acceptance is matched on document_id alone and the version column is
-- display-only, so bumping the string in place would leave existing acceptances silently
-- covering a counterparty nobody agreed to.
--
-- Cheap now precisely because it is early: 4 users, 0 bookings and 0 consent records at the
-- time of writing. The same correction against real trading history is a re-papering exercise.

INSERT INTO "legal_documents" (
  "id", "type", "version", "audience", "title", "path", "content",
  "content_hash", "effective_at", "updated_at"
) VALUES
(
  '00000000-0000-4000-8000-000000000401',
  'terms',
  '4.0',
  'all',
  'Terms of Service',
  '/terms',
  'Amazing Skills Terms of Service version 4.0 effective 2026-08-09',
  '661925d3570d44ac572db7b7bc853b3ee1706792f8e3677b9771b14e0b60ba31',
  '2026-08-09T00:00:00.000Z',
  CURRENT_TIMESTAMP
),
(
  '00000000-0000-4000-8000-000000000402',
  'privacy',
  '4.0',
  'all',
  'Privacy Policy',
  '/privacy',
  'Amazing Skills Privacy Policy version 4.0 effective 2026-08-09',
  '9e52120593cb85d6c25163148353182ffbf5a1f9a18c9480cab6efe288acb5a6',
  '2026-08-09T00:00:00.000Z',
  CURRENT_TIMESTAMP
),
(
  '00000000-0000-4000-8000-000000000403',
  'refund_policy',
  '4.0',
  'all',
  'Refund and Direct Payment Policy',
  '/refund-policy',
  'Amazing Skills Refund and Direct Payment Policy version 4.0 effective 2026-08-09',
  'a0890303e70604fde4fdf72563a7586399a400201bca1793b30622bb8ae17c18',
  '2026-08-09T00:00:00.000Z',
  CURRENT_TIMESTAMP
),
(
  '00000000-0000-4000-8000-000000000404',
  'teacher_agreement',
  '4.0',
  'teacher',
  'Teacher Agreement',
  '/teacher-agreement',
  'Amazing Skills Teacher Agreement version 4.0 effective 2026-08-09',
  '6fcd88566d860ad5ae5239c4e6a1af009b8de1392ae9c98b5012d964fa5e6f8c',
  '2026-08-09T00:00:00.000Z',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

UPDATE "legal_documents"
SET "superseded_at" = '2026-08-09T00:00:00.000Z', "updated_at" = CURRENT_TIMESTAMP
WHERE "version" = '3.0' AND "superseded_at" IS NULL;
