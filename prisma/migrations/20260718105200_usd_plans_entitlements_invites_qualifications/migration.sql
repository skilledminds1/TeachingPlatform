-- CreateEnum
CREATE TYPE "billing_interval" AS ENUM ('monthly', 'annual');

-- CreateEnum
CREATE TYPE "invitation_status" AS ENUM ('pending', 'accepted', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "qualification_status" AS ENUM ('pending', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "student_relationship_status" AS ENUM ('active', 'archived');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "billing_interval" "billing_interval" NOT NULL DEFAULT 'monthly',
ADD COLUMN     "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "current_period_end" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "plans" RENAME COLUMN "price_cents" TO "monthly_price_cents";

ALTER TABLE "plans"
ADD COLUMN     "annual_price_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "currency" SET DEFAULT 'USD',
ALTER COLUMN "student_limit" DROP NOT NULL,
ALTER COLUMN "marketplace_listing" SET DEFAULT true,
ALTER COLUMN "video_sessions" SET DEFAULT true,
ALTER COLUMN "teacher_payments" SET DEFAULT true;

-- CreateTable
CREATE TABLE "organization_invitations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "org_role" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" "invitation_status" NOT NULL DEFAULT 'pending',
    "invited_by_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_relationships" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "student_relationship_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_qualifications" (
    "id" UUID NOT NULL,
    "teacher_profile_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "issued_year" INTEGER NOT NULL,
    "credential_url" TEXT,
    "status" "qualification_status" NOT NULL DEFAULT 'pending',
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_qualifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_invitations_token_hash_key" ON "organization_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "organization_invitations_organization_id_status_idx" ON "organization_invitations"("organization_id", "status");

-- CreateIndex
CREATE INDEX "organization_invitations_email_idx" ON "organization_invitations"("email");

-- CreateIndex
CREATE INDEX "student_relationships_organization_id_status_idx" ON "student_relationships"("organization_id", "status");

-- CreateIndex
CREATE INDEX "student_relationships_teacher_id_status_idx" ON "student_relationships"("teacher_id", "status");

-- CreateIndex
CREATE INDEX "student_relationships_student_id_idx" ON "student_relationships"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_relationships_organization_id_teacher_id_student_id_key" ON "student_relationships"("organization_id", "teacher_id", "student_id");

-- CreateIndex
CREATE INDEX "teacher_qualifications_teacher_profile_id_idx" ON "teacher_qualifications"("teacher_profile_id");

-- CreateIndex
CREATE INDEX "teacher_qualifications_status_idx" ON "teacher_qualifications"("status");

-- AddForeignKey
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_relationships" ADD CONSTRAINT "student_relationships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_relationships" ADD CONSTRAINT "student_relationships_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_relationships" ADD CONSTRAINT "student_relationships_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_qualifications" ADD CONSTRAINT "teacher_qualifications_teacher_profile_id_fkey" FOREIGN KEY ("teacher_profile_id") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
