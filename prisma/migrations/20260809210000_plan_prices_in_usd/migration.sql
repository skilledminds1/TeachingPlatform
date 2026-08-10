-- Price the plans in the currency Paddle actually sells them in (PAY-03).
--
-- Paddle declined amazing-skills.com for verification. Their pre-submission checklist requires
-- "pricing that matches your Paddle catalog", and it did not: the site advertised R199 / R499 /
-- R899 while the Paddle catalogue holds $12 / $29 / $49. A reviewer comparing the two sees a
-- site selling something different from the account asking to charge for it.
--
-- The figures are the ones already created in Paddle, so this migration makes the database
-- agree with the catalogue rather than proposing new prices. Annual stays at ten months, the
-- ratio the ZAR prices used.
--
-- Note what is NOT happening here: no conversion. These are not the rand prices exchanged into
-- dollars, they are the dollar prices Paddle already sells. Converting would reintroduce the
-- rate this codebase spent a migration removing — see 20260808160000_price_plans_in_zar.

UPDATE "plans" SET "currency" = 'USD', "monthly_price_cents" = 1200,  "annual_price_cents" = 12000 WHERE "slug" = 'starter';
UPDATE "plans" SET "currency" = 'USD', "monthly_price_cents" = 2900,  "annual_price_cents" = 29000 WHERE "slug" = 'professional';
UPDATE "plans" SET "currency" = 'USD', "monthly_price_cents" = 4900,  "annual_price_cents" = 49000 WHERE "slug" = 'business';
UPDATE "plans" SET "currency" = 'USD', "monthly_price_cents" = 0,     "annual_price_cents" = 0     WHERE "slug" = 'free';
