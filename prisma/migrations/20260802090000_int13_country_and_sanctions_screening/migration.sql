-- INT-13 — Capture user country, and record restricted-jurisdiction and sanctions screening.
--
-- Three additions, none destructive:
--
-- 1. users.country. NULLABLE on purpose. Every existing account predates the field, and a
--    NOT NULL column would either fail the migration or invent a country for real people —
--    so registration enforces it going forward and existing users are prompted to fill it
--    in. Country gates payout eligibility (PAY-14), tax evidence (PAY-06) and the
--    restricted-jurisdiction check.
--
-- 2. teacher_profiles screening columns. The outcome of the sanctions-list screen run at
--    approval, kept on the row so an approval decision can be audited after the fact rather
--    than re-derived from a list that changes daily.
--
-- 3. compliance_events. admin_audit_logs requires an admin_user_id, so it cannot record a
--    registration refused by an automated jurisdiction check: there is no admin in that
--    flow, and the user may not exist yet. Hence the nullable user reference alongside a
--    plain email column.
--
-- NOTE ON NAMING: the existing `sanctions` table is a MODERATION penalty issued by an admin.
-- It is unrelated to trade sanctions. The new type is named sanctions_screening_status to
-- keep the two apart.

CREATE TYPE "sanctions_screening_status" AS ENUM ('not_screened', 'clear', 'review_required');

CREATE TYPE "compliance_event_kind" AS ENUM (
  'jurisdiction_blocked',
  'screening_clear',
  'screening_review_required',
  'screening_unavailable'
);

ALTER TABLE "users"
  ADD COLUMN "country" VARCHAR(2);

ALTER TABLE "teacher_profiles"
  ADD COLUMN "screening_status" "sanctions_screening_status" NOT NULL DEFAULT 'not_screened',
  ADD COLUMN "screened_at" TIMESTAMP(3),
  ADD COLUMN "screening_source" TEXT,
  ADD COLUMN "screening_matches" JSONB;

CREATE TABLE "compliance_events" (
  "id"           UUID NOT NULL,
  "user_id"      UUID,
  "email"        TEXT,
  "kind"         "compliance_event_kind" NOT NULL,
  "country_code" VARCHAR(2),
  "detail"       JSONB,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "compliance_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "compliance_events_user_id_idx" ON "compliance_events"("user_id");
CREATE INDEX "compliance_events_kind_created_at_idx" ON "compliance_events"("kind", "created_at");

ALTER TABLE "compliance_events"
  ADD CONSTRAINT "compliance_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
