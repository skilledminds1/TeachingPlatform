ALTER TABLE "organizations"
  ADD COLUMN "trial_ends_at" TIMESTAMP(3),
  ADD COLUMN "grace_started_at" TIMESTAMP(3),
  ADD COLUMN "grace_ends_at" TIMESTAMP(3),
  ADD COLUMN "pending_plan_id" UUID,
  ADD COLUMN "pending_billing_interval" "billing_interval",
  ADD COLUMN "pending_change_at" TIMESTAMP(3),
  ADD COLUMN "dunning_stage" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "dunning_last_notice_at" TIMESTAMP(3);

-- Free is an active, ongoing tier. Only legacy Free organizations without a
-- provider token are normalized; explicit paid trials keep their trial state.
UPDATE "organizations" AS o
SET "subscription_status" = 'active'::"subscription_status",
    "current_period_end" = NULL,
    "cancel_at_period_end" = FALSE
FROM "plans" AS p
WHERE o."plan_id" = p."id"
  AND p."slug" = 'free'
  AND o."payfast_token" IS NULL
  AND o."subscription_status" = 'trialing'::"subscription_status";

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_pending_plan_id_fkey"
  FOREIGN KEY ("pending_plan_id") REFERENCES "plans"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "organizations_pending_plan_id_idx" ON "organizations"("pending_plan_id");
CREATE INDEX "organizations_subscription_status_grace_ends_at_idx"
  ON "organizations"("subscription_status", "grace_ends_at");
CREATE INDEX "organizations_pending_change_at_idx" ON "organizations"("pending_change_at");
CREATE INDEX "organizations_trial_ends_at_idx" ON "organizations"("trial_ends_at");
