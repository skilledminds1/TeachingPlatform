-- Tie a sale to the Paddle discount that can actually apply it (PAY-03).
--
-- Sales survived the PayFast deletion as display-only: the plan cards still rendered "30% off"
-- while checkout charged list price, because Paddle takes a discount id and not a percentage
-- this application works out. That is the worst shape a pricing bug can take — silent, visible
-- to the customer, and first noticed by someone who has already paid.
--
-- Nullable, so a sale can be drafted before the discount exists in Paddle. getEffectivePlanPrice
-- reports a sale with no discount id as no sale at all, so the badge disappears rather than
-- lying. Existing rows get NULL and therefore stop advertising until someone links them.

ALTER TABLE "plan_sales" ADD COLUMN IF NOT EXISTS "paddle_discount_id" TEXT;
