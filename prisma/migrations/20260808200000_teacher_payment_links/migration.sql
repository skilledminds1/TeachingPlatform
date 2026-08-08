-- Teacher payment links: how a student pays a teacher without the platform touching the money.
--
-- Replaces the PayPal partner rail, which required a partner approval the founder does not
-- want, was double-gated off so no student could ever pay through it, and contained a
-- one-click payout-repointing defect (SEC-02). This design has no keys, no webhooks and no
-- provider relationship: the teacher saves a hosted-checkout link from their own PSP and the
-- platform renders an anchor to it.
--
-- Staging a CHANGE behind email confirmation is the load-bearing part, not a nicety. A saved
-- payout destination is the highest-value target on a stolen teacher session: repoint it once
-- and every future student payment goes elsewhere. The first link is set immediately — there
-- is nothing to protect yet — but replacing a live one requires the mailbox as well as the
-- session.

ALTER TABLE "teacher_profiles"
  ADD COLUMN "payment_link_url"                 TEXT,
  ADD COLUMN "payment_link_host"                TEXT,
  ADD COLUMN "payment_link_provider_id"         TEXT,
  ADD COLUMN "payment_link_set_at"              TIMESTAMP(3),
  ADD COLUMN "pending_payment_link_url"         TEXT,
  ADD COLUMN "pending_payment_link_host"        TEXT,
  ADD COLUMN "pending_payment_link_provider_id" TEXT,
  ADD COLUMN "pending_payment_link_token_hash"  TEXT,
  ADD COLUMN "pending_payment_link_requested_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "teacher_profiles_pending_payment_link_token_hash_key"
  ON "teacher_profiles"("pending_payment_link_token_hash");
