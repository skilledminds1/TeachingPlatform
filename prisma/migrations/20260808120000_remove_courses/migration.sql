-- Remove the courses product.
--
-- The platform is live 1:1 video tutoring only. Courses were cut deliberately: hosting and
-- gating course video would make Amazing Skills the deemed supplier of an electronically
-- supplied service in the EU and UK (Implementing Regulation 282/2011 Article 9a) regardless
-- of whether it took a commission — which is incompatible with the rule that the platform
-- never handles money between a student and a teacher. Live human tuition is not an
-- electronically supplied service, so the lesson rail is unaffected.
--
-- DESTRUCTIVE. This drops fifteen tables and every row in them. Take a database snapshot
-- before applying it to any environment that holds data you care about.

-- DropForeignKey
ALTER TABLE "payment_attempts" DROP CONSTRAINT "payment_attempts_course_purchase_id_fkey";

-- DropForeignKey
ALTER TABLE "refund_requests" DROP CONSTRAINT "refund_requests_course_purchase_id_fkey";

-- DropForeignKey
ALTER TABLE "courses" DROP CONSTRAINT "courses_teacher_id_fkey";

-- DropForeignKey
ALTER TABLE "courses" DROP CONSTRAINT "courses_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "courses" DROP CONSTRAINT "courses_subject_id_fkey";

-- DropForeignKey
ALTER TABLE "course_modules" DROP CONSTRAINT "course_modules_course_id_fkey";

-- DropForeignKey
ALTER TABLE "course_lessons" DROP CONSTRAINT "course_lessons_module_id_fkey";

-- DropForeignKey
ALTER TABLE "course_lesson_assets" DROP CONSTRAINT "course_lesson_assets_lesson_id_fkey";

-- DropForeignKey
ALTER TABLE "course_certificates" DROP CONSTRAINT "course_certificates_course_id_fkey";

-- DropForeignKey
ALTER TABLE "course_certificates" DROP CONSTRAINT "course_certificates_student_id_fkey";

-- DropForeignKey
ALTER TABLE "course_certificates" DROP CONSTRAINT "course_certificates_teacher_id_fkey";

-- DropForeignKey
ALTER TABLE "course_purchases" DROP CONSTRAINT "course_purchases_course_id_fkey";

-- DropForeignKey
ALTER TABLE "course_purchases" DROP CONSTRAINT "course_purchases_student_id_fkey";

-- DropForeignKey
ALTER TABLE "course_purchases" DROP CONSTRAINT "course_purchases_teacher_id_fkey";

-- DropForeignKey
ALTER TABLE "course_purchases" DROP CONSTRAINT "course_purchases_course_sale_id_fkey";

-- DropForeignKey
ALTER TABLE "course_purchases" DROP CONSTRAINT "course_purchases_course_coupon_id_fkey";

-- DropForeignKey
ALTER TABLE "course_enrollments" DROP CONSTRAINT "course_enrollments_course_id_fkey";

-- DropForeignKey
ALTER TABLE "course_enrollments" DROP CONSTRAINT "course_enrollments_student_id_fkey";

-- DropForeignKey
ALTER TABLE "course_enrollments" DROP CONSTRAINT "course_enrollments_purchase_id_fkey";

-- DropForeignKey
ALTER TABLE "course_reviews" DROP CONSTRAINT "course_reviews_enrollment_id_fkey";

-- DropForeignKey
ALTER TABLE "course_reviews" DROP CONSTRAINT "course_reviews_course_id_fkey";

-- DropForeignKey
ALTER TABLE "course_reviews" DROP CONSTRAINT "course_reviews_student_id_fkey";

-- DropForeignKey
ALTER TABLE "course_reviews" DROP CONSTRAINT "course_reviews_teacher_id_fkey";

-- DropForeignKey
ALTER TABLE "course_sales" DROP CONSTRAINT "course_sales_teacher_id_fkey";

-- DropForeignKey
ALTER TABLE "course_sale_courses" DROP CONSTRAINT "course_sale_courses_sale_id_fkey";

-- DropForeignKey
ALTER TABLE "course_sale_courses" DROP CONSTRAINT "course_sale_courses_course_id_fkey";

-- DropForeignKey
ALTER TABLE "course_coupons" DROP CONSTRAINT "course_coupons_teacher_id_fkey";

-- DropForeignKey
ALTER TABLE "course_coupons" DROP CONSTRAINT "course_coupons_course_id_fkey";

-- DropForeignKey
ALTER TABLE "course_coupon_redemptions" DROP CONSTRAINT "course_coupon_redemptions_coupon_id_fkey";

-- DropForeignKey
ALTER TABLE "course_coupon_redemptions" DROP CONSTRAINT "course_coupon_redemptions_purchase_id_fkey";

-- DropForeignKey
ALTER TABLE "course_coupon_redemptions" DROP CONSTRAINT "course_coupon_redemptions_student_id_fkey";

-- DropForeignKey
ALTER TABLE "course_questions" DROP CONSTRAINT "course_questions_course_id_fkey";

-- DropForeignKey
ALTER TABLE "course_questions" DROP CONSTRAINT "course_questions_student_id_fkey";

-- DropForeignKey
ALTER TABLE "course_answers" DROP CONSTRAINT "course_answers_question_id_fkey";

-- DropForeignKey
ALTER TABLE "course_answers" DROP CONSTRAINT "course_answers_teacher_id_fkey";

-- DropForeignKey
ALTER TABLE "course_lesson_progress" DROP CONSTRAINT "course_lesson_progress_lesson_id_fkey";

-- DropForeignKey
ALTER TABLE "course_lesson_progress" DROP CONSTRAINT "course_lesson_progress_student_id_fkey";

-- DropIndex
DROP INDEX "payment_attempts_course_purchase_id_idx";

-- DropIndex
DROP INDEX "refund_requests_course_purchase_id_key";

-- AlterTable
ALTER TABLE "plans" DROP COLUMN "course_limit";

-- AlterTable
ALTER TABLE "payment_attempts" DROP COLUMN "course_purchase_id";

-- AlterTable
ALTER TABLE "refund_requests" DROP COLUMN "course_purchase_id";

-- DropTable
DROP TABLE "courses";

-- DropTable
DROP TABLE "course_modules";

-- DropTable
DROP TABLE "course_lessons";

-- DropTable
DROP TABLE "course_lesson_assets";

-- DropTable
DROP TABLE "course_certificates";

-- DropTable
DROP TABLE "course_purchases";

-- DropTable
DROP TABLE "course_enrollments";

-- DropTable
DROP TABLE "course_reviews";

-- DropTable
DROP TABLE "course_sales";

-- DropTable
DROP TABLE "course_sale_courses";

-- DropTable
DROP TABLE "course_coupons";

-- DropTable
DROP TABLE "course_coupon_redemptions";

-- DropTable
DROP TABLE "course_questions";

-- DropTable
DROP TABLE "course_answers";

-- DropTable
DROP TABLE "course_lesson_progress";

-- DropEnum
DROP TYPE "course_status";

-- DropEnum
DROP TYPE "course_lesson_asset_kind";

-- DropEnum
DROP TYPE "course_level";

-- DropEnum
DROP TYPE "course_purchase_status";

-- DropEnum
DROP TYPE "course_discount_type";


-- Storage: revoke access to the three course buckets.
--
-- Added here rather than by editing 20260731010000_storage_hardening, which is already
-- applied and checksummed.
--
-- ONLY the policies are dropped here. Supabase installs a `storage.protect_delete()` trigger
-- that raises on any direct DELETE against storage.objects — "Direct deletion from storage
-- tables is not allowed. Use the Storage API instead." — so emptying and removing the buckets
-- cannot be done in SQL at all. That half runs through the Storage API:
--
--     npm run storage:remove-course-buckets
--
-- Dropping the policies first is the part that matters for safety: with no policy granting
-- access, a client holding only the publishable key can reach nothing in these buckets even
-- while the objects still exist. The application no longer references them in any code path.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    DROP POLICY IF EXISTS "course cover owner write" ON storage.objects;
    DROP POLICY IF EXISTS "course object owner access" ON storage.objects;
  END IF;
END $$;
