-- Price the subscription plans in the currency PayFast actually settles in.
--
-- Plans were priced in USD and converted at checkout by multiplying by
-- PAYFAST_USD_ZAR_RATE, a hand-maintained environment variable. Three defects came from that
-- one constant, and none of them is fixable while it exists:
--
--   1. PayFast fixes `recurring_amount` for the life of the token and nothing ever
--      re-baselined it, so every teacher pays whatever rand figure the rate produced on the
--      day they signed up — forever, while the catalogue moves on without them.
--   2. The ITN handler reconstructed the expected rand amount from the same rate and allowed
--      a 5% tolerance. Editing the rate by more than that made it return 400 on a legitimate
--      renewal PayFast had already charged: no invoice written, and the lifecycle job then
--      dunned a teacher who had paid.
--   3. The scheduled plan-change path multiplied by the rate too, and its earlier `?? 0`
--      fallback would have asked PayFast to set a live subscription's recurring charge to
--      R0.00 while granting the new plan.
--
-- Pricing in ZAR deletes the class rather than the three bugs.
--
-- THE AMOUNTS ARE A PROPOSAL. They are round rand figures near the previous dollar prices at
-- roughly R18/USD, with annual at ten months (the two-months-free ratio the USD prices used).
-- Change them here before applying if you want different numbers; this is the only place they
-- are set, and `prisma db seed` will not overwrite them — the seed upserts with `update: {}`.
--
--   Free          R0
--   Starter       R199 / month     R1 990 / year
--   Professional  R499 / month     R4 990 / year
--   Business      R899 / month     R8 990 / year
--
-- Existing subscribers are NOT re-priced at the provider. PayFast cannot change the amount on
-- an existing token from here, and silently altering what someone already agreed to pay is
-- not something a migration should do. Anyone already on a paid token keeps their current
-- charge until they change plan, which routes through updatePayfastSubscription.

UPDATE "plans" SET
  "currency" = 'ZAR',
  "monthly_price_cents" = 0,
  "annual_price_cents" = 0,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "slug" = 'free';

UPDATE "plans" SET
  "currency" = 'ZAR',
  "monthly_price_cents" = 19900,
  "annual_price_cents" = 199000,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "slug" = 'starter';

UPDATE "plans" SET
  "currency" = 'ZAR',
  "monthly_price_cents" = 49900,
  "annual_price_cents" = 499000,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "slug" = 'professional';

UPDATE "plans" SET
  "currency" = 'ZAR',
  "monthly_price_cents" = 89900,
  "annual_price_cents" = 899000,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "slug" = 'business';

-- Any plan added outside this list still needs a currency that matches settlement. Catch it
-- here rather than discovering it as a mis-charged teacher.
UPDATE "plans" SET
  "currency" = 'ZAR',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "currency" <> 'ZAR';

-- Invoices already issued keep the currency they were issued in. Rewriting historical
-- financial records to a currency they were never charged in would be a falsification, and
-- the column default is the only thing that needs to stop saying otherwise.
ALTER TABLE "subscription_invoices" ALTER COLUMN "currency" SET DEFAULT 'ZAR';

-- A new plan created without an explicit currency must not default to a currency PayFast
-- cannot settle in. This is the column behind Plan.currency.
ALTER TABLE "plans" ALTER COLUMN "currency" SET DEFAULT 'ZAR';
