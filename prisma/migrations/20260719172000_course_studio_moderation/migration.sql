-- AlterEnum
ALTER TYPE "course_status" ADD VALUE IF NOT EXISTS 'pending_approval';
ALTER TYPE "course_status" ADD VALUE IF NOT EXISTS 'rejected';

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "course_lesson_asset_kind" AS ENUM ('video', 'resource');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "courses"
  ADD COLUMN IF NOT EXISTS "certificate_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "submitted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "course_lesson_assets" (
  "id" UUID NOT NULL,
  "lesson_id" UUID NOT NULL,
  "kind" "course_lesson_asset_kind" NOT NULL,
  "storage_path" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "course_lesson_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "course_certificates" (
  "id" UUID NOT NULL,
  "course_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "teacher_id" UUID NOT NULL,
  "verification_code" TEXT NOT NULL,
  "student_name" TEXT NOT NULL,
  "course_title" TEXT NOT NULL,
  "teacher_name" TEXT NOT NULL,
  "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "course_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "course_lesson_assets_lesson_id_kind_sort_order_idx"
  ON "course_lesson_assets"("lesson_id", "kind", "sort_order");

CREATE INDEX IF NOT EXISTS "course_lesson_assets_storage_path_idx"
  ON "course_lesson_assets"("storage_path");

CREATE UNIQUE INDEX IF NOT EXISTS "course_certificates_verification_code_key"
  ON "course_certificates"("verification_code");

CREATE UNIQUE INDEX IF NOT EXISTS "course_certificates_course_id_student_id_key"
  ON "course_certificates"("course_id", "student_id");

CREATE INDEX IF NOT EXISTS "course_certificates_student_id_idx"
  ON "course_certificates"("student_id");

CREATE INDEX IF NOT EXISTS "course_certificates_teacher_id_idx"
  ON "course_certificates"("teacher_id");

CREATE INDEX IF NOT EXISTS "course_certificates_verification_code_idx"
  ON "course_certificates"("verification_code");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "course_lesson_assets"
    ADD CONSTRAINT "course_lesson_assets_lesson_id_fkey"
    FOREIGN KEY ("lesson_id") REFERENCES "course_lessons"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "course_certificates"
    ADD CONSTRAINT "course_certificates_course_id_fkey"
    FOREIGN KEY ("course_id") REFERENCES "courses"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "course_certificates"
    ADD CONSTRAINT "course_certificates_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "course_certificates"
    ADD CONSTRAINT "course_certificates_teacher_id_fkey"
    FOREIGN KEY ("teacher_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Backfill legacy lesson files into assets when present
INSERT INTO "course_lesson_assets" (
  "id",
  "lesson_id",
  "kind",
  "storage_path",
  "file_name",
  "mime_type",
  "size_bytes",
  "sort_order",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  l."id",
  'resource'::"course_lesson_asset_kind",
  l."file_storage_path",
  COALESCE(l."file_name", 'lesson-file'),
  COALESCE(l."file_mime_type", 'application/octet-stream'),
  0,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "course_lessons" l
WHERE l."file_storage_path" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "course_lesson_assets" a
    WHERE a."lesson_id" = l."id"
      AND a."storage_path" = l."file_storage_path"
  );
