-- Allow under-18 students, with verified guardian consent.
--
-- What this replaces: `legal_acceptances.confirmed_adult`, a checkbox nobody checked, on a
-- platform whose Terms claimed 18+, whose seeded subject catalogue is the South African
-- school curriculum, whose marketing addresses parents, and which operates the video room in
-- which an adult meets that child. The checkbox was the only thing standing between those
-- facts and each other.
--
-- POPIA s35 requires the consent of a "competent person" to process a child's personal
-- information and defines a child as anyone under 18. GDPR Art 8 sets its digital-consent age
-- between 13 and 16 depending on member state. Implementing the stricter rule — under 18
-- needs guardian consent — satisfies both with one flow.

CREATE TYPE "guardian_consent_status" AS ENUM ('pending', 'verified', 'revoked');

-- Date, not timestamp. The time of day is meaningless for a birth date and storing it invites
-- timezone drift into an age calculation, where being one day out is the entire question.
--
-- Nullable, like `country` before it (INT-13). NULL means "not yet stated" and is NOT treated
-- as adult anywhere: every gate reads an unknown age as unverified.
ALTER TABLE "users" ADD COLUMN "date_of_birth" DATE;

CREATE TABLE "guardian_consents" (
  "id"              UUID NOT NULL,
  "minor_user_id"   UUID NOT NULL,
  "guardian_name"   TEXT NOT NULL,
  "guardian_email"  TEXT NOT NULL,
  "relationship"    TEXT NOT NULL,
  "status"          "guardian_consent_status" NOT NULL DEFAULT 'pending',
  -- Only the hash, mirroring organization_invitations. A database dump must not contain a
  -- working consent link.
  "token_hash"      TEXT NOT NULL,
  "expires_at"      TIMESTAMP(3) NOT NULL,
  "requested_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verified_at"     TIMESTAMP(3),
  "revoked_at"      TIMESTAMP(3),
  "revoked_reason"  TEXT,
  "ip_hash"         TEXT,
  "user_agent_hash" TEXT,
  "policy_version"  TEXT NOT NULL,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "guardian_consents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guardian_consents_minor_user_id_key" ON "guardian_consents"("minor_user_id");
CREATE UNIQUE INDEX "guardian_consents_token_hash_key" ON "guardian_consents"("token_hash");
CREATE INDEX "guardian_consents_guardian_email_idx" ON "guardian_consents"("guardian_email");
CREATE INDEX "guardian_consents_status_idx" ON "guardian_consents"("status");

ALTER TABLE "guardian_consents"
  ADD CONSTRAINT "guardian_consents_minor_user_id_fkey"
  FOREIGN KEY ("minor_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS, matching the posture every other application table has (SEC-01). All access is through
-- Prisma on the direct connection as table owner, so a deny-all policy costs the app nothing
-- and keeps a table of children's guardians off PostgREST.
ALTER TABLE "guardian_consents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guardian_consents" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "guardian_consents" FROM anon, authenticated;
