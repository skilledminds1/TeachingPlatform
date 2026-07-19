-- CreateEnum
CREATE TYPE "reschedule_proposal_status" AS ENUM ('pending', 'accepted', 'declined', 'expired', 'cancelled');

-- CreateTable
CREATE TABLE "booking_reschedule_proposals" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "proposed_by_id" UUID NOT NULL,
    "proposed_starts_at" TIMESTAMP(3) NOT NULL,
    "proposed_ends_at" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" "reschedule_proposal_status" NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_reschedule_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_reschedule_proposals_booking_id_status_idx" ON "booking_reschedule_proposals"("booking_id", "status");

-- CreateIndex
CREATE INDEX "booking_reschedule_proposals_proposed_by_id_idx" ON "booking_reschedule_proposals"("proposed_by_id");

-- CreateIndex
CREATE INDEX "booking_reschedule_proposals_proposed_starts_at_proposed_ends_at_idx" ON "booking_reschedule_proposals"("proposed_starts_at", "proposed_ends_at");

-- CreateIndex
CREATE INDEX "booking_reschedule_proposals_status_expires_at_idx" ON "booking_reschedule_proposals"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "booking_reschedule_proposals" ADD CONSTRAINT "booking_reschedule_proposals_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_reschedule_proposals" ADD CONSTRAINT "booking_reschedule_proposals_proposed_by_id_fkey" FOREIGN KEY ("proposed_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
