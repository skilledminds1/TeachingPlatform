-- Version 5.0: Paddle is the merchant of record, and that changes who teachers contract with.
--
-- The PayFast rail is deleted. Subscriptions are now sold by Paddle.com Market Ltd, which is
-- the seller and the party to the purchase — not Amazing Skills. Paddle collects the payment,
-- issues the invoice, holds the card details, and is responsible for sales tax and VAT in the
-- teacher's own jurisdiction.
--
-- That is the whole reason this is a version bump rather than a wording tidy. Who a person
-- contracts with, who holds their card number, and who owes the tax are not details of the
-- agreement; they are the agreement. Existing acceptances cover a document that named a
-- different arrangement, so new ids send everyone back through /legal-review.
--
-- Second bump today. The first corrected the operator from a sole proprietorship to SKILLED
-- MINDS (PTY) LTD. Doing both at once was not possible: the entity was wrong the moment it was
-- discovered, and the payment rail changed hours later. Still cheap — 4 users, 0 bookings.

INSERT INTO "legal_documents" (
  "id", "type", "version", "audience", "title", "path", "content",
  "content_hash", "effective_at", "updated_at"
) VALUES
(
  '00000000-0000-4000-8000-000000000501',
  'terms',
  '5.0',
  'all',
  'Terms of Service',
  '/terms',
  'Amazing Skills Terms of Service version 5.0 effective 2026-08-09',
  '847e0714c4396bcefe7f89226dc5844e4a50065565044e27e30d0d6d4fff03ed',
  '2026-08-09T00:00:00.000Z',
  CURRENT_TIMESTAMP
),
(
  '00000000-0000-4000-8000-000000000502',
  'privacy',
  '5.0',
  'all',
  'Privacy Policy',
  '/privacy',
  'Amazing Skills Privacy Policy version 5.0 effective 2026-08-09',
  'f77cd90d10f73b48af664d7137066f5adf4602d94c91696e71d55ed63414f8e9',
  '2026-08-09T00:00:00.000Z',
  CURRENT_TIMESTAMP
),
(
  '00000000-0000-4000-8000-000000000503',
  'refund_policy',
  '5.0',
  'all',
  'Refund and Direct Payment Policy',
  '/refund-policy',
  'Amazing Skills Refund and Direct Payment Policy version 5.0 effective 2026-08-09',
  '189902ed8364af2784aed2b2b59fc3f933ec1158215fa5a1391002da4365d794',
  '2026-08-09T00:00:00.000Z',
  CURRENT_TIMESTAMP
),
(
  '00000000-0000-4000-8000-000000000504',
  'teacher_agreement',
  '5.0',
  'teacher',
  'Teacher Agreement',
  '/teacher-agreement',
  'Amazing Skills Teacher Agreement version 5.0 effective 2026-08-09',
  '5cdd162c92dd8695af07f05692bce6e33f2c39c5e872caa781ab17e584fbd1ac',
  '2026-08-09T00:00:00.000Z',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

UPDATE "legal_documents"
SET "superseded_at" = '2026-08-09T00:00:00.000Z', "updated_at" = CURRENT_TIMESTAMP
WHERE "version" = '4.0' AND "superseded_at" IS NULL;
