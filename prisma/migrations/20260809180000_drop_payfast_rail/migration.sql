-- The PayFast rail is gone (PAY-03). Paddle is the only way anyone pays for a subscription.
--
-- Safe to drop rather than deprecate: the column was never populated in production. Zero rows
-- carried a token, zero subscription invoices were ever raised, and no teacher ever completed
-- a PayFast checkout. There is no history here to preserve — only a column that would now be
-- read by nothing and misread by the next person to see it.
--
-- billing_events keeps its `provider` column and every row it has. The default moves to
-- 'paddle' so new rows say what they are; existing rows keep whatever they said, because
-- rewriting history to claim a payment came from a provider that never took it would be worse
-- than a column nobody queries.

ALTER TABLE "organizations" DROP COLUMN IF EXISTS "payfast_token";

ALTER TABLE "billing_events" ALTER COLUMN "provider" SET DEFAULT 'paddle';

-- The enum keeps every historical value and gains the current one. Values are added, never
-- removed: a Postgres enum cannot drop a label that any row might still hold, and the audit
-- rows that name a dead rail are the reason the label has to survive it.
ALTER TYPE "payment_provider" ADD VALUE IF NOT EXISTS 'paddle';
