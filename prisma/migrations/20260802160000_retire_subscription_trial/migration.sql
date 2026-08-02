-- MON-25: retire the paid trial.
--
-- startPaidTrial had no caller in any registration, checkout or admin flow, so no
-- organization ever entered 'trialing' through the product. Rows can still hold it for one
-- reason: the init migration (20260718100112) defaulted subscription_status to 'trialing',
-- and the backfill in 20260719211000 deliberately normalized only Free organizations
-- without a provider token -- "explicit paid trials keep their trial state". Anything
-- created in that window on a paid plan, or on Free with a token, was left behind.
--
-- Those rows are the reason the trialing branches could not simply be deleted: removing the
-- isGrowthBlocked branch would have silently unblocked an expired trial, and removing the
-- lifecycle trial-end branch would have stranded the row in a state nothing converts out of.
-- Normalize them first, exactly as runSubscriptionLifecycle's trial-end branch did, then
-- remove the value so the type can no longer express a state the product does not have.

-- 1. Drain any legacy trial to the state the lifecycle job would have moved it to.
--    Free is an active, ongoing tier; the plan itself constrains what they can do.
UPDATE "organizations"
SET "subscription_status" = 'active'::"subscription_status",
    "trial_ends_at" = NULL,
    "current_period_end" = NULL,
    "pending_plan_id" = NULL,
    "pending_billing_interval" = NULL,
    "pending_change_at" = NULL
WHERE "subscription_status" = 'trialing'::"subscription_status";

-- 2. Drop 'trialing' from the enum. Postgres has no ALTER TYPE ... DROP VALUE, so the type
--    is recreated and the column re-pointed at it. The default is dropped and restored
--    around the retype because a default referencing the old type blocks the conversion.
ALTER TYPE "subscription_status" RENAME TO "subscription_status_old";

CREATE TYPE "subscription_status" AS ENUM ('active', 'past_due', 'cancelled');

ALTER TABLE "organizations"
  ALTER COLUMN "subscription_status" DROP DEFAULT,
  ALTER COLUMN "subscription_status" TYPE "subscription_status"
    USING "subscription_status"::text::"subscription_status",
  ALTER COLUMN "subscription_status" SET DEFAULT 'active';

DROP TYPE "subscription_status_old";

-- trial_ends_at is deliberately left in place. Nothing reads or writes it after this, but
-- dropping a column is irreversible and belongs with a wider schema cleanup rather than
-- with the removal of the code that used it.
