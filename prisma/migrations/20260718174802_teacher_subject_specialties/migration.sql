-- AlterTable
ALTER TABLE "bookings" ALTER COLUMN "currency" SET DEFAULT 'USD';

-- AlterTable
ALTER TABLE "plans" ALTER COLUMN "annual_price_cents" DROP DEFAULT;

-- AlterTable
ALTER TABLE "teacher_profiles" ALTER COLUMN "currency" SET DEFAULT 'USD';

-- AlterTable
ALTER TABLE "teacher_subjects" ADD COLUMN     "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[];
