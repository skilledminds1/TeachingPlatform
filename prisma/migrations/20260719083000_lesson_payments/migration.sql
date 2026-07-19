-- AlterEnum
ALTER TYPE "payment_provider" ADD VALUE IF NOT EXISTS 'payfast';

-- CreateEnum
CREATE TYPE "payment_attempt_status" AS ENUM (
  'pending',
  'requires_action',
  'succeeded',
  'failed',
  'expired',
  'refunded',
  'partially_refunded'
);

-- CreateEnum
CREATE TYPE "teacher_payment_onboarding_status" AS ENUM (
  'not_started',
  'pending',
  'complete',
  'restricted'
);

-- AlterTable
ALTER TABLE "teacher_payment_accounts"
  ADD COLUMN IF NOT EXISTS "onboarding_status" "teacher_payment_onboarding_status" NOT NULL DEFAULT 'complete',
  ADD COLUMN IF NOT EXISTS "settlement_currency" TEXT,
  ADD COLUMN IF NOT EXISTS "country" TEXT,
  ADD COLUMN IF NOT EXISTS "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- AlterTable
ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "payment_expires_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bookings_payment_expires_at_idx" ON "bookings"("payment_expires_at");

-- CreateTable
CREATE TABLE IF NOT EXISTS "payment_attempts" (
  "id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "provider" "payment_provider" NOT NULL,
  "status" "payment_attempt_status" NOT NULL DEFAULT 'pending',
  "amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "provider_checkout_id" TEXT,
  "provider_payment_id" TEXT,
  "teacher_merchant_id" TEXT NOT NULL,
  "checkout_url" TEXT,
  "failure_code" TEXT,
  "failure_message" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "succeeded_at" TIMESTAMP(3),
  "refunded_cents" INTEGER NOT NULL DEFAULT 0,
  "idempotency_key" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "payment_events" (
  "id" UUID NOT NULL,
  "payment_attempt_id" UUID,
  "provider" "payment_provider" NOT NULL,
  "provider_event_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "payment_attempts_idempotency_key_key" ON "payment_attempts"("idempotency_key");
CREATE INDEX IF NOT EXISTS "payment_attempts_booking_id_idx" ON "payment_attempts"("booking_id");
CREATE INDEX IF NOT EXISTS "payment_attempts_provider_status_idx" ON "payment_attempts"("provider", "status");
CREATE INDEX IF NOT EXISTS "payment_attempts_provider_checkout_id_idx" ON "payment_attempts"("provider_checkout_id");
CREATE INDEX IF NOT EXISTS "payment_attempts_provider_payment_id_idx" ON "payment_attempts"("provider_payment_id");
CREATE INDEX IF NOT EXISTS "payment_attempts_expires_at_idx" ON "payment_attempts"("expires_at");
CREATE UNIQUE INDEX IF NOT EXISTS "payment_events_provider_provider_event_id_key" ON "payment_events"("provider", "provider_event_id");
CREATE INDEX IF NOT EXISTS "payment_events_payment_attempt_id_idx" ON "payment_events"("payment_attempt_id");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "payment_attempts"
    ADD CONSTRAINT "payment_attempts_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "payment_events"
    ADD CONSTRAINT "payment_events_payment_attempt_id_fkey"
    FOREIGN KEY ("payment_attempt_id") REFERENCES "payment_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
