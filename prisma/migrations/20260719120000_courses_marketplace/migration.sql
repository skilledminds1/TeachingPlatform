-- CreateEnum
CREATE TYPE "course_status" AS ENUM ('draft', 'published', 'archived');
CREATE TYPE "course_level" AS ENUM ('beginner', 'intermediate', 'advanced', 'all_levels');
CREATE TYPE "course_purchase_status" AS ENUM ('pending', 'succeeded', 'refunded', 'cancelled');

-- AlterTable: PaymentAttempt supports booking OR course purchase
ALTER TABLE "payment_attempts" ALTER COLUMN "booking_id" DROP NOT NULL;
ALTER TABLE "payment_attempts" ADD COLUMN "course_purchase_id" UUID;

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subject_id" UUID,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "cover_image_url" TEXT,
    "price_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "level" "course_level" NOT NULL DEFAULT 'all_levels',
    "status" "course_status" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "course_modules" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_modules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "course_lessons" (
    "id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "video_url" TEXT,
    "file_storage_path" TEXT,
    "file_name" TEXT,
    "file_mime_type" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_lessons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "course_purchases" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "course_purchase_status" NOT NULL DEFAULT 'pending',
    "payment_provider" "payment_provider",
    "payment_external_id" TEXT,
    "payment_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_purchases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "course_enrollments" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_enrollments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "course_lesson_progress" (
    "id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_lesson_progress_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "courses_slug_key" ON "courses"("slug");
CREATE INDEX "courses_teacher_id_idx" ON "courses"("teacher_id");
CREATE INDEX "courses_organization_id_idx" ON "courses"("organization_id");
CREATE INDEX "courses_subject_id_idx" ON "courses"("subject_id");
CREATE INDEX "courses_status_idx" ON "courses"("status");
CREATE INDEX "courses_slug_idx" ON "courses"("slug");

CREATE INDEX "course_modules_course_id_sort_order_idx" ON "course_modules"("course_id", "sort_order");

CREATE INDEX "course_lessons_module_id_sort_order_idx" ON "course_lessons"("module_id", "sort_order");

CREATE INDEX "course_purchases_course_id_idx" ON "course_purchases"("course_id");
CREATE INDEX "course_purchases_student_id_idx" ON "course_purchases"("student_id");
CREATE INDEX "course_purchases_teacher_id_idx" ON "course_purchases"("teacher_id");
CREATE INDEX "course_purchases_status_idx" ON "course_purchases"("status");
CREATE INDEX "course_purchases_payment_expires_at_idx" ON "course_purchases"("payment_expires_at");

CREATE UNIQUE INDEX "course_enrollments_purchase_id_key" ON "course_enrollments"("purchase_id");
CREATE UNIQUE INDEX "course_enrollments_course_id_student_id_key" ON "course_enrollments"("course_id", "student_id");
CREATE INDEX "course_enrollments_student_id_idx" ON "course_enrollments"("student_id");
CREATE INDEX "course_enrollments_course_id_idx" ON "course_enrollments"("course_id");

CREATE UNIQUE INDEX "course_lesson_progress_lesson_id_student_id_key" ON "course_lesson_progress"("lesson_id", "student_id");
CREATE INDEX "course_lesson_progress_student_id_idx" ON "course_lesson_progress"("student_id");

CREATE INDEX "payment_attempts_course_purchase_id_idx" ON "payment_attempts"("course_purchase_id");

-- Foreign keys
ALTER TABLE "courses" ADD CONSTRAINT "courses_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "courses" ADD CONSTRAINT "courses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "courses" ADD CONSTRAINT "courses_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "course_lessons" ADD CONSTRAINT "course_lessons_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "course_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "course_purchases" ADD CONSTRAINT "course_purchases_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_purchases" ADD CONSTRAINT "course_purchases_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_purchases" ADD CONSTRAINT "course_purchases_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "course_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "course_lesson_progress" ADD CONSTRAINT "course_lesson_progress_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "course_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_lesson_progress" ADD CONSTRAINT "course_lesson_progress_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_course_purchase_id_fkey" FOREIGN KEY ("course_purchase_id") REFERENCES "course_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one purchasable target per payment attempt
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_exactly_one_target_check"
  CHECK (
    ("booking_id" IS NOT NULL AND "course_purchase_id" IS NULL)
    OR ("booking_id" IS NULL AND "course_purchase_id" IS NOT NULL)
  );
