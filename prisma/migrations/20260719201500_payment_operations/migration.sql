-- CreateEnum
CREATE TYPE "refund_request_status" AS ENUM (
  'requested',
  'teacher_approved',
  'teacher_declined',
  'refunded',
  'escalated',
  'resolved',
  'cancelled'
);

-- CreateEnum
CREATE TYPE "payment_dispute_status" AS ENUM (
  'open',
  'under_review',
  'resolved_won',
  'resolved_lost',
  'closed'
);

-- CreateEnum
CREATE TYPE "subscription_invoice_status" AS ENUM ('paid', 'refunded', 'void');

-- CreateTable
CREATE TABLE "subscription_invoices" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "billing_event_id" UUID NOT NULL,
  "provider_payment_id" TEXT NOT NULL,
  "status" "subscription_invoice_status" NOT NULL DEFAULT 'paid',
  "amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'ZAR',
  "description" TEXT NOT NULL,
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "subscription_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_requests" (
  "id" UUID NOT NULL,
  "booking_id" UUID,
  "course_purchase_id" UUID,
  "payment_attempt_id" UUID,
  "student_id" UUID NOT NULL,
  "teacher_id" UUID NOT NULL,
  "status" "refund_request_status" NOT NULL DEFAULT 'requested',
  "requested_amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "policy_eligible" BOOLEAN NOT NULL DEFAULT false,
  "teacher_response" TEXT,
  "provider_refund_id" TEXT,
  "provider_refunded_cents" INTEGER NOT NULL DEFAULT 0,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "responded_at" TIMESTAMP(3),
  "escalated_at" TIMESTAMP(3),
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "refund_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "refund_requests_target_check" CHECK (
    (("booking_id" IS NOT NULL)::int + ("course_purchase_id" IS NOT NULL)::int) = 1
  )
);

-- CreateTable
CREATE TABLE "payment_disputes" (
  "id" UUID NOT NULL,
  "payment_attempt_id" UUID NOT NULL,
  "provider_case_id" TEXT NOT NULL,
  "status" "payment_dispute_status" NOT NULL DEFAULT 'open',
  "reason" TEXT,
  "amount_cents" INTEGER,
  "currency" TEXT,
  "payload" JSONB,
  "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "payment_disputes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_invoices_billing_event_id_key" ON "subscription_invoices"("billing_event_id");
CREATE UNIQUE INDEX "subscription_invoices_provider_payment_id_key" ON "subscription_invoices"("provider_payment_id");
CREATE INDEX "subscription_invoices_organization_id_issued_at_idx" ON "subscription_invoices"("organization_id", "issued_at");
CREATE INDEX "subscription_invoices_status_idx" ON "subscription_invoices"("status");

CREATE UNIQUE INDEX "refund_requests_booking_id_key" ON "refund_requests"("booking_id");
CREATE UNIQUE INDEX "refund_requests_course_purchase_id_key" ON "refund_requests"("course_purchase_id");
CREATE INDEX "refund_requests_student_id_status_idx" ON "refund_requests"("student_id", "status");
CREATE INDEX "refund_requests_teacher_id_status_idx" ON "refund_requests"("teacher_id", "status");
CREATE INDEX "refund_requests_status_requested_at_idx" ON "refund_requests"("status", "requested_at");

CREATE UNIQUE INDEX "payment_disputes_provider_case_id_key" ON "payment_disputes"("provider_case_id");
CREATE INDEX "payment_disputes_payment_attempt_id_idx" ON "payment_disputes"("payment_attempt_id");
CREATE INDEX "payment_disputes_status_opened_at_idx" ON "payment_disputes"("status", "opened_at");

-- AddForeignKey
ALTER TABLE "subscription_invoices"
ADD CONSTRAINT "subscription_invoices_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subscription_invoices"
ADD CONSTRAINT "subscription_invoices_billing_event_id_fkey"
FOREIGN KEY ("billing_event_id") REFERENCES "billing_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "refund_requests"
ADD CONSTRAINT "refund_requests_booking_id_fkey"
FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "refund_requests"
ADD CONSTRAINT "refund_requests_course_purchase_id_fkey"
FOREIGN KEY ("course_purchase_id") REFERENCES "course_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "refund_requests"
ADD CONSTRAINT "refund_requests_payment_attempt_id_fkey"
FOREIGN KEY ("payment_attempt_id") REFERENCES "payment_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "refund_requests"
ADD CONSTRAINT "refund_requests_student_id_fkey"
FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "refund_requests"
ADD CONSTRAINT "refund_requests_teacher_id_fkey"
FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_disputes"
ADD CONSTRAINT "payment_disputes_payment_attempt_id_fkey"
FOREIGN KEY ("payment_attempt_id") REFERENCES "payment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
