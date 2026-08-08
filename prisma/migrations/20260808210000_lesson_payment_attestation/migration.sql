-- Record that a lesson was paid for, without pretending to know it.
--
-- The platform never receives lesson money and gets no webhook from the teacher's own
-- provider, so it cannot verify a payment. These columns hold an attestation and nothing
-- turns on them: booking confirmation runs off teacher acceptance, completion runs off
-- attendance in the video room. Both are facts the platform owns and neither party can
-- fabricate alone.
--
-- Why an attestation is trustworthy here and worthless on a commission marketplace: a teacher
-- who under-reports on a marketplace that takes a cut saves money, so their word is useless.
-- At 0% on lessons, misreporting buys nothing. THAT INVERSION IS THE WHOLE REASON THIS IS
-- SAFE. If a commission on lessons is ever introduced, this model collapses the same day and
-- the platform is back to needing escrow.
ALTER TABLE "bookings"
  ADD COLUMN "payment_reported_at" TIMESTAMP(3),
  ADD COLUMN "payment_reported_by" UUID,
  ADD COLUMN "payment_reference"   TEXT;
