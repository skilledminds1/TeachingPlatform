-- Align the organizations.subscription_status column default with the schema.
--
-- The init migration defaulted new organizations to 'trialing'. Since the subscription
-- lifecycle work, 'trialing' means an explicit paid trial only, and 20260719211000
-- backfilled free organizations to 'active' without changing the column default. Prisma
-- Client hid the mismatch because it sends the model default on every insert, so only a
-- raw SQL insert would land in a trial state it never earned.

ALTER TABLE "organizations"
  ALTER COLUMN "subscription_status" SET DEFAULT 'active';
