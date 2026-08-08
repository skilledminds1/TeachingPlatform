-- Confirm bookings on teacher acceptance instead of on a payment capture.
--
-- The platform never receives lesson money and gets no webhook from the teacher's own payment
-- provider, so it cannot wait for a payment it will never be told about. Before this change
-- the ONLY writer of `confirmed` was the PayPal capture path, which is double-gated off — so
-- no booking could ever be confirmed, no video room was ever provisioned, and the core loop
-- could not complete for anyone.
--
-- `pending_payment` is renamed rather than replaced. Every availability, quota and calendar
-- query already treats it as "this slot is held", which stays exactly true; only the thing
-- being waited on changes. Renaming keeps those semantics and avoids leaving a dead enum
-- member behind.

ALTER TYPE "booking_status" RENAME VALUE 'pending_payment' TO 'pending_teacher_confirmation';

ALTER TABLE "bookings" RENAME COLUMN "payment_expires_at" TO "confirmation_expires_at";
ALTER INDEX "bookings_payment_expires_at_idx" RENAME TO "bookings_confirmation_expires_at_idx";

ALTER TABLE "teacher_profiles"
  ADD COLUMN "auto_accept_bookings" BOOLEAN NOT NULL DEFAULT false;

-- Drain the bookings stranded by the defect above.
--
-- These rows have been sitting since the day they were made, and they are not inert: both
-- getAvailableSlots and the double-booking conflict check count a held booking as occupied,
-- so every one of them has been permanently blocking that hour on its teacher's calendar. The
-- 30-minute hold they were created with expired long ago; under the new flow the equivalent
-- window is 72 hours, so anything older than that never got an answer and never will.
UPDATE "bookings"
SET "status" = 'cancelled',
    "cancellation_reason" = 'Expired before the teacher-confirmation flow existed',
    "confirmation_expires_at" = NULL,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "status" = 'pending_teacher_confirmation'
  AND "created_at" < CURRENT_TIMESTAMP - INTERVAL '72 hours';

-- Anything newer is genuinely still awaiting an answer. Put it on the new 72-hour clock
-- measured from when it was requested, rather than leaving it on a payment deadline that has
-- already passed and would expire it on the next job run.
UPDATE "bookings"
SET "confirmation_expires_at" = "created_at" + INTERVAL '72 hours',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "status" = 'pending_teacher_confirmation';

-- Any payment attempt still open against a booking that just closed is dead with it.
UPDATE "payment_attempts"
SET "status" = 'expired',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "status" IN ('pending', 'requires_action')
  AND "booking_id" IN (SELECT "id" FROM "bookings" WHERE "status" = 'cancelled');
