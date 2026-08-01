-- MON-35 — Make course certificates revocable.
--
-- A certificate previously had no lifecycle beyond issuance. applyRefundToAttempt revoked
-- the enrollment when a purchase was refunded but left the certificate untouched, and the
-- public verification page renders whatever it finds as valid -- so it kept vouching for a
-- student whose purchase had been reversed.

ALTER TABLE "course_certificates"
  ADD COLUMN "revoked_at" TIMESTAMP(3),
  ADD COLUMN "revocation_reason" TEXT;

-- Verification looks up by code and must cheaply distinguish live from revoked.
CREATE INDEX "course_certificates_revoked_at_idx" ON "course_certificates"("revoked_at");
