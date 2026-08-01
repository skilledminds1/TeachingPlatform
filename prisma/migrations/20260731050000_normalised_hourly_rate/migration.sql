-- INT-12 — Normalise hourly rates so the price filter and sort are coherent.
--
-- searchTeachers applied `hourly_rate_cents <= :maxRate` and ordered by the same column,
-- while every teacher stores their own settlement currency. The numbers being compared were
-- therefore in different units: a GBP 45 teacher (about USD 57) sat inside the
-- "Up to $50/hour" bucket while a genuinely cheaper teacher in another currency could be
-- excluded, and "price: low to high" ordered by a meaningless mixture.
--
-- This column exists for FILTERING AND RANKING ONLY. Nothing charges from it — students
-- always pay the teacher's own listed amount in the teacher's own currency.

ALTER TABLE "teacher_profiles"
  ADD COLUMN "hourly_rate_usd_cents" INTEGER NOT NULL DEFAULT 0;

-- Backfill using the same reference rates as src/lib/fx.ts. Kept in sync by
-- src/lib/fx.test.ts, which fails if the two drift apart.
UPDATE "teacher_profiles"
SET "hourly_rate_usd_cents" = ROUND(
  "hourly_rate_cents" / CASE UPPER("currency")
    WHEN 'USD' THEN 1.00
    WHEN 'EUR' THEN 0.92
    WHEN 'GBP' THEN 0.79
    WHEN 'AUD' THEN 1.52
    WHEN 'CAD' THEN 1.36
    -- Anything unrecognised (including rows predating the ZAR removal) is treated as USD.
    -- Ranking it roughly is better than hiding the teacher from price filtering entirely.
    ELSE 1.00
  END
);

CREATE INDEX "teacher_profiles_hourly_rate_usd_cents_idx"
  ON "teacher_profiles"("hourly_rate_usd_cents");
