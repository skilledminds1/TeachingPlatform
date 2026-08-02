-- QLT-04 — Record scheduled-job runs so a job that stops can be noticed.
--
-- isCronAuthorized returns false whenever CRON_SECRET is undefined. That is correct
-- fail-closed security, but the variable is optional, so a missing or mistyped value makes
-- all six jobs return 401 forever. Reminders stop sending, abandoned payments never expire,
-- grace periods and dunning never run — and every symptom is an ABSENCE, which is the one
-- kind of failure that log-reading never surfaces and that no error tracker fires on.
--
-- One row per job, updated in place. A full run history would help debugging but grows
-- without bound and needs its own pruning job; staleness only ever needs the latest run.
--
-- last_ok_at is kept separately from last_run_at on purpose: a job that fires on schedule
-- and fails every single time is exactly as dead as one that never fires, and a single
-- timestamp cannot tell those apart.

CREATE TABLE "job_runs" (
  "id"          UUID NOT NULL,
  "job"         TEXT NOT NULL,
  "last_run_at" TIMESTAMP(3) NOT NULL,
  "last_ok_at"  TIMESTAMP(3),
  "last_status" TEXT NOT NULL,
  "last_detail" TEXT,
  "run_count"   INTEGER NOT NULL DEFAULT 0,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL,

  CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "job_runs_job_key" ON "job_runs"("job");
