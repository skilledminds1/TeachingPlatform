-- CreateEnum
CREATE TYPE "plan_sale_interval_scope" AS ENUM ('monthly', 'annual', 'both');

-- AlterTable
ALTER TABLE "organizations"
ADD COLUMN "complimentary_plan_id" UUID,
ADD COLUMN "complimentary_expires_at" TIMESTAMP(3),
ADD COLUMN "complimentary_granted_by_id" UUID,
ADD COLUMN "complimentary_granted_at" TIMESTAMP(3),
ADD COLUMN "complimentary_previous_plan_id" UUID,
ADD COLUMN "complimentary_note" TEXT;

-- AlterTable
ALTER TABLE "plans"
ADD COLUMN "description" TEXT,
ADD COLUMN "highlighted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "is_public" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "plan_sales" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "percent_off" INTEGER NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "interval_scope" "plan_sale_interval_scope" NOT NULL DEFAULT 'both',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_sale_plans" (
    "sale_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,

    CONSTRAINT "plan_sale_plans_pkey" PRIMARY KEY ("sale_id","plan_id")
);

-- CreateIndex
CREATE INDEX "organizations_complimentary_plan_id_idx" ON "organizations"("complimentary_plan_id");

-- CreateIndex
CREATE INDEX "organizations_complimentary_expires_at_idx" ON "organizations"("complimentary_expires_at");

-- CreateIndex
CREATE INDEX "plans_sort_order_idx" ON "plans"("sort_order");

-- CreateIndex
CREATE INDEX "plan_sales_active_starts_at_ends_at_idx" ON "plan_sales"("active", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "plan_sale_plans_plan_id_idx" ON "plan_sale_plans"("plan_id");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_complimentary_plan_id_fkey" FOREIGN KEY ("complimentary_plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_complimentary_previous_plan_id_fkey" FOREIGN KEY ("complimentary_previous_plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_complimentary_granted_by_id_fkey" FOREIGN KEY ("complimentary_granted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_sale_plans" ADD CONSTRAINT "plan_sale_plans_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "plan_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_sale_plans" ADD CONSTRAINT "plan_sale_plans_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed display metadata for existing plans without overwriting admin edits later
UPDATE "plans" SET
  "description" = CASE "slug"
    WHEN 'free' THEN 'Perfect for trying the platform.'
    WHEN 'starter' THEN 'For new tutors.'
    WHEN 'professional' THEN 'For growing businesses.'
    WHEN 'business' THEN 'For serious educators and schools.'
    ELSE "description"
  END,
  "highlighted" = CASE WHEN "slug" = 'professional' THEN true ELSE "highlighted" END,
  "sort_order" = CASE "slug"
    WHEN 'free' THEN 0
    WHEN 'starter' THEN 1
    WHEN 'professional' THEN 2
    WHEN 'business' THEN 3
    ELSE "sort_order"
  END
WHERE "description" IS NULL;
