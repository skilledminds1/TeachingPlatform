-- Account enforcement
CREATE TYPE "account_status" AS ENUM ('active', 'restricted', 'suspended', 'removed');
CREATE TYPE "enforcement_scope" AS ENUM ('messaging', 'booking', 'selling', 'publishing');
CREATE TYPE "safety_report_status" AS ENUM ('submitted', 'triaged', 'investigating', 'resolved', 'dismissed');
CREATE TYPE "moderation_case_type" AS ENUM ('refund', 'safety', 'conduct');
CREATE TYPE "moderation_case_status" AS ENUM ('open', 'under_review', 'awaiting_response', 'resolved', 'closed');
CREATE TYPE "case_priority" AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE "sanction_type" AS ENUM ('warning', 'restriction', 'suspension', 'delist', 'removal');
CREATE TYPE "appeal_status" AS ENUM ('submitted', 'under_review', 'upheld', 'modified', 'overturned');
CREATE TYPE "privacy_request_type" AS ENUM ('export', 'deletion', 'correction', 'objection');
CREATE TYPE "privacy_request_status" AS ENUM ('submitted', 'verifying', 'in_progress', 'completed', 'denied', 'cancelled');

ALTER TABLE "users"
  ADD COLUMN "account_status" "account_status" NOT NULL DEFAULT 'active',
  ADD COLUMN "account_status_reason" TEXT,
  ADD COLUMN "account_restricted_until" TIMESTAMP(3);

CREATE INDEX "users_account_status_idx" ON "users"("account_status");

-- Reports and user blocks
CREATE TABLE "safety_reports" (
  "id" UUID NOT NULL,
  "reporter_id" UUID NOT NULL,
  "subject_id" UUID,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "target_type" TEXT,
  "target_id" UUID,
  "status" "safety_report_status" NOT NULL DEFAULT 'submitted',
  "resolution" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "resolved_at" TIMESTAMP(3),
  CONSTRAINT "safety_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_blocks" (
  "id" UUID NOT NULL,
  "blocker_id" UUID NOT NULL,
  "blocked_id" UUID NOT NULL,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_blocks_blocker_id_blocked_id_key" ON "user_blocks"("blocker_id", "blocked_id");
CREATE INDEX "user_blocks_blocked_id_idx" ON "user_blocks"("blocked_id");
CREATE INDEX "safety_reports_reporter_id_created_at_idx" ON "safety_reports"("reporter_id", "created_at");
CREATE INDEX "safety_reports_subject_id_status_idx" ON "safety_reports"("subject_id", "status");
CREATE INDEX "safety_reports_status_created_at_idx" ON "safety_reports"("status", "created_at");

ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_reporter_id_fkey"
  FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_subject_id_fkey"
  FOREIGN KEY ("subject_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_fkey"
  FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_fkey"
  FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Moderation cases and shared mediation
CREATE TABLE "moderation_cases" (
  "id" UUID NOT NULL,
  "type" "moderation_case_type" NOT NULL,
  "status" "moderation_case_status" NOT NULL DEFAULT 'open',
  "priority" "case_priority" NOT NULL DEFAULT 'normal',
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "reporter_id" UUID,
  "subject_id" UUID,
  "assigned_admin_id" UUID,
  "resolution" TEXT,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "moderation_cases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "case_messages" (
  "id" UUID NOT NULL,
  "case_id" UUID NOT NULL,
  "sender_id" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "case_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "case_notes" (
  "id" UUID NOT NULL,
  "case_id" UUID NOT NULL,
  "author_id" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "case_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "case_evidence" (
  "id" UUID NOT NULL,
  "case_id" UUID NOT NULL,
  "uploaded_by_id" UUID NOT NULL,
  "storage_path" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "sha256" TEXT,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "case_evidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sanctions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "case_id" UUID,
  "issued_by_id" UUID NOT NULL,
  "type" "sanction_type" NOT NULL,
  "scopes" "enforcement_scope"[] DEFAULT ARRAY[]::"enforcement_scope"[],
  "reason" TEXT NOT NULL,
  "evidence" TEXT,
  "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ends_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "revoked_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sanctions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "appeals" (
  "id" UUID NOT NULL,
  "sanction_id" UUID NOT NULL,
  "case_id" UUID,
  "appellant_id" UUID NOT NULL,
  "status" "appeal_status" NOT NULL DEFAULT 'submitted',
  "reason" TEXT NOT NULL,
  "evidence" TEXT,
  "reviewer_id" UUID,
  "decision" TEXT,
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "appeals_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "refund_requests" ADD COLUMN "moderation_case_id" UUID;
CREATE UNIQUE INDEX "refund_requests_moderation_case_id_key" ON "refund_requests"("moderation_case_id");

CREATE INDEX "moderation_cases_status_priority_created_at_idx" ON "moderation_cases"("status", "priority", "created_at");
CREATE INDEX "moderation_cases_reporter_id_idx" ON "moderation_cases"("reporter_id");
CREATE INDEX "moderation_cases_subject_id_idx" ON "moderation_cases"("subject_id");
CREATE INDEX "moderation_cases_assigned_admin_id_status_idx" ON "moderation_cases"("assigned_admin_id", "status");
CREATE INDEX "case_messages_case_id_created_at_idx" ON "case_messages"("case_id", "created_at");
CREATE INDEX "case_messages_sender_id_idx" ON "case_messages"("sender_id");
CREATE INDEX "case_notes_case_id_created_at_idx" ON "case_notes"("case_id", "created_at");
CREATE INDEX "case_evidence_case_id_created_at_idx" ON "case_evidence"("case_id", "created_at");
CREATE INDEX "case_evidence_storage_path_idx" ON "case_evidence"("storage_path");
CREATE INDEX "sanctions_user_id_starts_at_ends_at_idx" ON "sanctions"("user_id", "starts_at", "ends_at");
CREATE INDEX "sanctions_case_id_idx" ON "sanctions"("case_id");
CREATE INDEX "sanctions_type_idx" ON "sanctions"("type");
CREATE UNIQUE INDEX "appeals_sanction_id_appellant_id_key" ON "appeals"("sanction_id", "appellant_id");
CREATE INDEX "appeals_status_submitted_at_idx" ON "appeals"("status", "submitted_at");
CREATE INDEX "appeals_appellant_id_idx" ON "appeals"("appellant_id");

ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_reporter_id_fkey"
  FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_subject_id_fkey"
  FOREIGN KEY ("subject_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_assigned_admin_id_fkey"
  FOREIGN KEY ("assigned_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_moderation_case_id_fkey"
  FOREIGN KEY ("moderation_case_id") REFERENCES "moderation_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "case_messages" ADD CONSTRAINT "case_messages_case_id_fkey"
  FOREIGN KEY ("case_id") REFERENCES "moderation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_messages" ADD CONSTRAINT "case_messages_sender_id_fkey"
  FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_case_id_fkey"
  FOREIGN KEY ("case_id") REFERENCES "moderation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "case_evidence" ADD CONSTRAINT "case_evidence_case_id_fkey"
  FOREIGN KEY ("case_id") REFERENCES "moderation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_evidence" ADD CONSTRAINT "case_evidence_uploaded_by_id_fkey"
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_case_id_fkey"
  FOREIGN KEY ("case_id") REFERENCES "moderation_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_issued_by_id_fkey"
  FOREIGN KEY ("issued_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_sanction_id_fkey"
  FOREIGN KEY ("sanction_id") REFERENCES "sanctions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_case_id_fkey"
  FOREIGN KEY ("case_id") REFERENCES "moderation_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_appellant_id_fkey"
  FOREIGN KEY ("appellant_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_reviewer_id_fkey"
  FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Privacy rights workflow. Deletion requests are reviewed and fulfilled with
-- legally required payment, audit, and safety records retained.
CREATE TABLE "privacy_requests" (
  "id" UUID NOT NULL,
  "requester_id" UUID NOT NULL,
  "type" "privacy_request_type" NOT NULL,
  "status" "privacy_request_status" NOT NULL DEFAULT 'submitted',
  "details" TEXT,
  "response" TEXT,
  "assigned_admin_id" UUID,
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "privacy_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "privacy_requests_requester_id_submitted_at_idx" ON "privacy_requests"("requester_id", "submitted_at");
CREATE INDEX "privacy_requests_status_submitted_at_idx" ON "privacy_requests"("status", "submitted_at");
CREATE INDEX "privacy_requests_assigned_admin_id_status_idx" ON "privacy_requests"("assigned_admin_id", "status");

ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_requester_id_fkey"
  FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_assigned_admin_id_fkey"
  FOREIGN KEY ("assigned_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
