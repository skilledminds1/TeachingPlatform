CREATE TYPE "course_discount_type" AS ENUM ('percent', 'fixed');

ALTER TABLE "course_lessons"
  ADD COLUMN "is_preview" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "course_purchases"
  ADD COLUMN "list_amount_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "discount_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "discount_source" TEXT,
  ADD COLUMN "course_sale_id" UUID,
  ADD COLUMN "course_coupon_id" UUID;

UPDATE "course_purchases" SET "list_amount_cents" = "amount_cents";
ALTER TABLE "course_purchases" ALTER COLUMN "list_amount_cents" DROP DEFAULT;

CREATE TABLE "course_reviews" (
  "id" UUID NOT NULL,
  "enrollment_id" UUID NOT NULL,
  "course_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "teacher_id" UUID NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" TEXT NOT NULL,
  "status" "review_status" NOT NULL DEFAULT 'pending',
  "teacher_response" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "course_reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "course_reviews_rating_check" CHECK ("rating" BETWEEN 1 AND 5)
);

CREATE TABLE "course_sales" (
  "id" UUID NOT NULL,
  "teacher_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "discount_type" "course_discount_type" NOT NULL,
  "discount_value" INTEGER NOT NULL,
  "starts_at" TIMESTAMP(3) NOT NULL,
  "ends_at" TIMESTAMP(3) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "course_sales_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "course_sales_dates_check" CHECK ("ends_at" > "starts_at"),
  CONSTRAINT "course_sales_discount_check" CHECK ("discount_value" > 0)
);

CREATE TABLE "course_sale_courses" (
  "sale_id" UUID NOT NULL,
  "course_id" UUID NOT NULL,
  CONSTRAINT "course_sale_courses_pkey" PRIMARY KEY ("sale_id", "course_id")
);

CREATE TABLE "course_coupons" (
  "id" UUID NOT NULL,
  "teacher_id" UUID NOT NULL,
  "course_id" UUID,
  "code" TEXT NOT NULL,
  "discount_type" "course_discount_type" NOT NULL,
  "discount_value" INTEGER NOT NULL,
  "starts_at" TIMESTAMP(3),
  "ends_at" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "max_redemptions" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "course_coupons_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "course_coupons_discount_check" CHECK ("discount_value" > 0),
  CONSTRAINT "course_coupons_max_redemptions_check" CHECK ("max_redemptions" IS NULL OR "max_redemptions" > 0)
);

CREATE TABLE "course_coupon_redemptions" (
  "id" UUID NOT NULL,
  "coupon_id" UUID NOT NULL,
  "purchase_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "redeemed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "course_coupon_redemptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "course_questions" (
  "id" UUID NOT NULL,
  "course_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "hidden" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "course_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "course_answers" (
  "id" UUID NOT NULL,
  "question_id" UUID NOT NULL,
  "teacher_id" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "course_answers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "course_reviews_enrollment_id_key" ON "course_reviews"("enrollment_id");
CREATE UNIQUE INDEX "course_reviews_student_id_course_id_key" ON "course_reviews"("student_id", "course_id");
CREATE INDEX "course_reviews_course_id_status_idx" ON "course_reviews"("course_id", "status");
CREATE INDEX "course_reviews_teacher_id_status_idx" ON "course_reviews"("teacher_id", "status");
CREATE INDEX "course_sales_teacher_id_active_starts_at_ends_at_idx" ON "course_sales"("teacher_id", "active", "starts_at", "ends_at");
CREATE INDEX "course_sale_courses_course_id_idx" ON "course_sale_courses"("course_id");
CREATE UNIQUE INDEX "course_coupons_teacher_id_code_key" ON "course_coupons"("teacher_id", "code");
CREATE INDEX "course_coupons_teacher_id_active_idx" ON "course_coupons"("teacher_id", "active");
CREATE INDEX "course_coupons_course_id_idx" ON "course_coupons"("course_id");
CREATE UNIQUE INDEX "course_coupon_redemptions_purchase_id_key" ON "course_coupon_redemptions"("purchase_id");
CREATE UNIQUE INDEX "course_coupon_redemptions_coupon_id_student_id_key" ON "course_coupon_redemptions"("coupon_id", "student_id");
CREATE INDEX "course_coupon_redemptions_coupon_id_redeemed_at_idx" ON "course_coupon_redemptions"("coupon_id", "redeemed_at");
CREATE INDEX "course_coupon_redemptions_student_id_idx" ON "course_coupon_redemptions"("student_id");
CREATE INDEX "course_questions_course_id_hidden_created_at_idx" ON "course_questions"("course_id", "hidden", "created_at");
CREATE INDEX "course_questions_student_id_idx" ON "course_questions"("student_id");
CREATE UNIQUE INDEX "course_answers_question_id_key" ON "course_answers"("question_id");
CREATE INDEX "course_answers_teacher_id_idx" ON "course_answers"("teacher_id");
CREATE INDEX "course_purchases_course_sale_id_idx" ON "course_purchases"("course_sale_id");
CREATE INDEX "course_purchases_course_coupon_id_idx" ON "course_purchases"("course_coupon_id");

ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "course_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_sales" ADD CONSTRAINT "course_sales_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_sale_courses" ADD CONSTRAINT "course_sale_courses_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "course_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_sale_courses" ADD CONSTRAINT "course_sale_courses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_coupons" ADD CONSTRAINT "course_coupons_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_coupons" ADD CONSTRAINT "course_coupons_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_coupon_redemptions" ADD CONSTRAINT "course_coupon_redemptions_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "course_coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "course_coupon_redemptions" ADD CONSTRAINT "course_coupon_redemptions_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "course_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_coupon_redemptions" ADD CONSTRAINT "course_coupon_redemptions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_questions" ADD CONSTRAINT "course_questions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_questions" ADD CONSTRAINT "course_questions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_answers" ADD CONSTRAINT "course_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "course_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_answers" ADD CONSTRAINT "course_answers_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_purchases" ADD CONSTRAINT "course_purchases_course_sale_id_fkey" FOREIGN KEY ("course_sale_id") REFERENCES "course_sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "course_purchases" ADD CONSTRAINT "course_purchases_course_coupon_id_fkey" FOREIGN KEY ("course_coupon_id") REFERENCES "course_coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
