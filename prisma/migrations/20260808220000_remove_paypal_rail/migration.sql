-- Remove the PayPal rail and the payment ledger that existed only to serve it.
--
-- The rail required a partner approval the founder does not want, was double-gated off so no
-- student could ever reach it, and carried a one-click payout-repointing defect. Students now
-- pay teachers on the teacher's own hosted checkout, which the platform never touches.
--
-- WHY THE LEDGER GOES TOO. PaymentAttempt, PaymentEvent and PaymentDispute recorded what the
-- platform captured on a teacher's behalf. With no capture there is no writer: every row was
-- created by the PayPal path, and the tables are empty because no payment ever succeeded here.
-- Keeping them would leave live UI — teacher earnings, admin payments, platform analytics —
-- querying tables that can never be written, which reads as "no payments yet" forever rather
-- than as a broken feature. Those views now read the teacher's own attestation instead.
--
-- PaymentDispute has no successor. A chargeback feed came from the card network via the
-- provider webhook; with no provider relationship there is nothing to feed it. A student's
-- complaint arrives as a refund request or a trust-and-safety case, both of which remain.
--
-- TeacherPaymentAccount is replaced by TeacherProfile.paymentLinkUrl. Its `country` and
-- `settlementCurrency` columns were read in five places and written in none, so any logic that
-- appeared to route on them was inert.
--
-- RefundRequest.payment_attempt_id goes with it. A refund is now raised against the booking
-- and its own price — the platform has no payment record to reconcile against, and said so.
--
-- DESTRUCTIVE, but only nominally: these tables have never held a row on this deployment.
-- Check before applying anywhere that might differ:
--   select count(*) from payment_attempts;
--   select count(*) from teacher_payment_accounts;

-- DropForeignKey
ALTER TABLE "teacher_payment_accounts" DROP CONSTRAINT "teacher_payment_accounts_user_id_fkey";

-- DropForeignKey
ALTER TABLE "payment_attempts" DROP CONSTRAINT "payment_attempts_booking_id_fkey";

-- DropForeignKey
ALTER TABLE "refund_requests" DROP CONSTRAINT "refund_requests_payment_attempt_id_fkey";

-- DropForeignKey
ALTER TABLE "payment_disputes" DROP CONSTRAINT "payment_disputes_payment_attempt_id_fkey";

-- DropForeignKey
ALTER TABLE "payment_events" DROP CONSTRAINT "payment_events_payment_attempt_id_fkey";

-- AlterTable
ALTER TABLE "refund_requests" DROP COLUMN "payment_attempt_id";

-- DropTable
DROP TABLE "teacher_payment_accounts";

-- DropTable
DROP TABLE "payment_attempts";

-- DropTable
DROP TABLE "payment_disputes";

-- DropTable
DROP TABLE "payment_events";

-- DropEnum
DROP TYPE "payment_attempt_status";

-- DropEnum
DROP TYPE "teacher_payment_onboarding_status";

-- DropEnum
DROP TYPE "payment_dispute_status";

