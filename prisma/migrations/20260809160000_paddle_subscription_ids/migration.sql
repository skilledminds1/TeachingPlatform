-- Somewhere to put Paddle's identifiers (PAY-03).
--
-- payfast_token is deliberately NOT dropped here. Paddle cannot take a real payment until its
-- business verification passes, so PayFast is still the rail; removing the column now would
-- break the working checkout to serve a migration that has not happened yet. It goes when the
-- cutover does.
--
-- Two columns rather than one because Paddle separates them and so should we: the customer
-- outlives any individual subscription, and reusing it is what stops a returning teacher
-- accumulating duplicate customer records with their invoice history split between them.

ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "paddle_customer_id" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "paddle_subscription_id" TEXT;

-- A Paddle subscription belongs to exactly one organization. Without this a webhook replayed
-- against the wrong organization could quietly attach a live subscription to a second one, and
-- both would then believe they were paying for it.
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_paddle_subscription_id_key"
  ON "organizations" ("paddle_subscription_id")
  WHERE "paddle_subscription_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "organizations_paddle_customer_id_idx"
  ON "organizations" ("paddle_customer_id");
