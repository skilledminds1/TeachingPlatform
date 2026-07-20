-- CreateEnum
CREATE TYPE "legal_document_type" AS ENUM (
  'terms',
  'privacy',
  'refund_policy',
  'teacher_agreement'
);

-- CreateEnum
CREATE TYPE "legal_audience" AS ENUM ('all', 'teacher');

-- CreateEnum
CREATE TYPE "legal_acceptance_method" AS ENUM (
  'email_signup',
  'oauth_review',
  'reacceptance'
);

-- CreateTable
CREATE TABLE "legal_documents" (
  "id" UUID NOT NULL,
  "type" "legal_document_type" NOT NULL,
  "version" TEXT NOT NULL,
  "audience" "legal_audience" NOT NULL DEFAULT 'all',
  "title" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "content_hash" TEXT NOT NULL,
  "effective_at" TIMESTAMP(3) NOT NULL,
  "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "superseded_at" TIMESTAMP(3),
  "mandatory" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_acceptances" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "document_id" UUID NOT NULL,
  "accepted_role" TEXT NOT NULL,
  "method" "legal_acceptance_method" NOT NULL,
  "confirmed_adult" BOOLEAN NOT NULL DEFAULT true,
  "ip_hash" TEXT,
  "user_agent_hash" TEXT,
  "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "legal_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "purpose" TEXT NOT NULL,
  "granted" BOOLEAN NOT NULL,
  "policy_version" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "withdrawn_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "legal_documents_type_version_key" ON "legal_documents"("type", "version");
CREATE INDEX "legal_documents_type_effective_at_idx" ON "legal_documents"("type", "effective_at");
CREATE INDEX "legal_documents_mandatory_superseded_at_idx" ON "legal_documents"("mandatory", "superseded_at");
CREATE UNIQUE INDEX "legal_acceptances_user_id_document_id_key" ON "legal_acceptances"("user_id", "document_id");
CREATE INDEX "legal_acceptances_user_id_accepted_at_idx" ON "legal_acceptances"("user_id", "accepted_at");
CREATE INDEX "legal_acceptances_document_id_idx" ON "legal_acceptances"("document_id");
CREATE INDEX "consent_records_user_id_purpose_captured_at_idx" ON "consent_records"("user_id", "purpose", "captured_at");

-- AddForeignKey
ALTER TABLE "legal_acceptances"
ADD CONSTRAINT "legal_acceptances_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "legal_acceptances"
ADD CONSTRAINT "legal_acceptances_document_id_fkey"
FOREIGN KEY ("document_id") REFERENCES "legal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "consent_records"
ADD CONSTRAINT "consent_records_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the first mandatory document versions. Full rendered text lives in source control;
-- the stored content key and hash identify the exact accepted version.
INSERT INTO "legal_documents" (
  "id", "type", "version", "audience", "title", "path", "content",
  "content_hash", "effective_at", "updated_at"
) VALUES
(
  '00000000-0000-4000-8000-000000000101',
  'terms',
  '1.0',
  'all',
  'Terms of Service',
  '/terms',
  'Amazing Skills Terms of Service version 1.0 effective 2026-07-19',
  '40eae1feb8efca883f6259862e30a58a3212ec92670ce6e993ff607a7c77867a',
  '2026-07-19T00:00:00.000Z',
  CURRENT_TIMESTAMP
),
(
  '00000000-0000-4000-8000-000000000102',
  'privacy',
  '1.0',
  'all',
  'Privacy Policy',
  '/privacy',
  'Amazing Skills Privacy Policy version 1.0 effective 2026-07-19',
  '25dddecd97d6f370db8877bc6516396ae754a9c3483f845a8eea3b7b403b236b',
  '2026-07-19T00:00:00.000Z',
  CURRENT_TIMESTAMP
),
(
  '00000000-0000-4000-8000-000000000103',
  'refund_policy',
  '1.0',
  'all',
  'Refund and Direct Payment Policy',
  '/refund-policy',
  'Amazing Skills Refund and Direct Payment Policy version 1.0 effective 2026-07-19',
  '44a7f0ddc952e15e45f85a85dbad24d91bdb1f46f8689c1b4159252cd3c4e4f7',
  '2026-07-19T00:00:00.000Z',
  CURRENT_TIMESTAMP
),
(
  '00000000-0000-4000-8000-000000000104',
  'teacher_agreement',
  '1.0',
  'teacher',
  'Teacher Agreement',
  '/teacher-agreement',
  'Amazing Skills Teacher Agreement version 1.0 effective 2026-07-19',
  '730ce3cbf2741babfddceec217022d7210422b617eda3a3a66b56e44ea6487b5',
  '2026-07-19T00:00:00.000Z',
  CURRENT_TIMESTAMP
);
