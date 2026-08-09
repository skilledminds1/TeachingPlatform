-- Move rate-limit counters from Upstash Redis into the application's own Postgres.
--
-- Redis is genuinely better at this workload. The reason to move anyway is that a separate
-- store added a failure mode: enforceActionRateLimit fails CLOSED on credential actions, so
-- an Upstash outage meant nobody could sign up, sign in or reset a password while every other
-- page returned 200 and monitoring stayed green. Sharing the database the app already cannot
-- run without makes "the store is down" and "the app is down" the same condition.
--
-- `key` is the primary key and the concurrency control. Counting happens in ONE statement —
-- INSERT ... ON CONFLICT DO UPDATE — which takes a row lock, so two simultaneous requests
-- cannot both read the old count and both write count+1. A read-then-write would lose that
-- race, and losing it means under-counting under concurrency: failing at the only moment the
-- limiter exists for.
--
-- Windows are evaluated against the DATABASE clock. Serverless instances drift, and a limiter
-- whose window boundary depends on which machine answered is not a limiter.
CREATE TABLE "rate_limits" (
  "key"        TEXT NOT NULL,
  "count"      INTEGER NOT NULL DEFAULT 0,
  "reset_at"   TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key")
);

-- Supports the periodic sweep. Redis expired keys itself; Postgres does not, so rows would
-- otherwise accumulate one per key per window forever. Expired rows are already inert — every
-- read compares reset_at against now() — so the sweep is housekeeping, not correctness.
CREATE INDEX "rate_limits_reset_at_idx" ON "rate_limits"("reset_at");

-- RLS to match every other application table (SEC-01). All access is through Prisma on the
-- direct connection as table owner, so deny-all costs the application nothing and keeps a
-- table keyed by hashed client identity off PostgREST.
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rate_limits" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "rate_limits" FROM anon, authenticated;
