CREATE TYPE "email_outbox_status" AS ENUM ('pending', 'processing', 'sent', 'failed');
CREATE TYPE "email_delivery_status" AS ENUM ('sent', 'retrying', 'failed');

CREATE TABLE "user_notification_preferences" (
  "user_id" UUID NOT NULL,
  "email_reminders" BOOLEAN NOT NULL DEFAULT true,
  "email_messages" BOOLEAN NOT NULL DEFAULT false,
  "email_marketing" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "email_outbox" (
  "id" UUID NOT NULL,
  "user_id" UUID,
  "recipient" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "html" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "status" "email_outbox_status" NOT NULL DEFAULT 'pending',
  "idempotency_key" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at" TIMESTAMP(3),
  "provider_message_id" TEXT,
  "last_error" TEXT,
  "sent_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_outbox_attempts_check" CHECK ("attempts" >= 0 AND "max_attempts" > 0)
);

CREATE TABLE "email_delivery_logs" (
  "id" UUID NOT NULL,
  "outbox_id" UUID NOT NULL,
  "attempt" INTEGER NOT NULL,
  "status" "email_delivery_status" NOT NULL,
  "provider" TEXT NOT NULL,
  "provider_message_id" TEXT,
  "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_delivery_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_outbox_idempotency_key_key" ON "email_outbox"("idempotency_key");
CREATE INDEX "email_outbox_status_next_attempt_at_idx" ON "email_outbox"("status", "next_attempt_at");
CREATE INDEX "email_outbox_user_id_created_at_idx" ON "email_outbox"("user_id", "created_at");
CREATE INDEX "email_outbox_created_at_idx" ON "email_outbox"("created_at");
CREATE INDEX "email_delivery_logs_outbox_id_created_at_idx" ON "email_delivery_logs"("outbox_id", "created_at");
CREATE INDEX "email_delivery_logs_status_created_at_idx" ON "email_delivery_logs"("status", "created_at");

ALTER TABLE "user_notification_preferences"
  ADD CONSTRAINT "user_notification_preferences_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_outbox"
  ADD CONSTRAINT "email_outbox_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "email_delivery_logs"
  ADD CONSTRAINT "email_delivery_logs_outbox_id_fkey"
  FOREIGN KEY ("outbox_id") REFERENCES "email_outbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
