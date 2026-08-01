-- INT-11 — Daily reference exchange rates.
--
-- INT-12 introduced a static rate table for ranking. Checking it against the live ECB feed
-- the day after writing it, GBP was already 6% out (0.79 stored vs 0.745 actual) and AUD
-- nearly 7%. That is enough to move a teacher a whole bucket in the price filter, which is
-- the drift this table exists to remove.
--
-- Display and ranking ONLY. Nothing is charged from these rates — students always pay the
-- teacher's listed amount in the teacher's own currency.

CREATE TABLE "fx_rates" (
    "base_currency" TEXT NOT NULL,
    "quote_currency" TEXT NOT NULL,
    -- Decimal, not float: rates are compared and multiplied, and binary floating point
    -- makes those results depend on evaluation order.
    "rate" DECIMAL(20,10) NOT NULL,
    -- The date the SOURCE published this rate, as opposed to when we fetched it. A feed
    -- that keeps returning last Friday's numbers looks fresh by fetched_at while being
    -- stale by as_of — the staleness alarm keys on this column for that reason.
    "as_of" DATE NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,

    CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("base_currency","quote_currency")
);

CREATE INDEX "fx_rates_as_of_idx" ON "fx_rates"("as_of");
