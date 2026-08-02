import { db } from "@/lib/db";
import { logger } from "@/lib/observability/logger";
import {
  assessJob,
  CRON_JOB_NAMES,
  type CronJobName,
  type JobLiveness,
} from "@/server/jobs/registry";

/**
 * Check-in recording for scheduled jobs (QLT-04).
 *
 * Every job route already authorised, worked and returned. None of them left any trace that
 * they had run, so a job that stopped firing was indistinguishable from one with nothing to
 * do — and an absence is the one failure mode no error tracker reports.
 */

/**
 * Wrap a job handler so each invocation checks in.
 *
 * ONLY a 2xx counts as a run. A 401 from a missing or wrong CRON_SECRET must not look like
 * a healthy check-in, or the monitoring would confirm the very failure it exists to catch.
 *
 * Recording never changes the response: a job that did its work and then failed to write a
 * monitoring row has still done its work, and turning that into a 500 would make the
 * observability less reliable than the thing it observes.
 */
export function withJobCheckIn(
  job: CronJobName,
  handler: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const startedAt = new Date();
    try {
      const response = await handler(request);
      if (response.ok) {
        await recordJobRun(job, startedAt, "ok", null);
      } else if (response.status !== 401) {
        // A 401 is an unauthorised caller, not a run. Anything else that got past the gate
        // and failed is a real failed run and worth recording as one.
        await recordJobRun(job, startedAt, "failed", `HTTP ${response.status}`);
      }
      return response;
    } catch (error) {
      await recordJobRun(job, startedAt, "failed", String(error).slice(0, 500));
      throw error;
    }
  };
}

async function recordJobRun(
  job: CronJobName,
  startedAt: Date,
  status: "ok" | "failed",
  detail: string | null,
): Promise<void> {
  try {
    await db.jobRun.upsert({
      where: { job },
      create: {
        job,
        lastRunAt: startedAt,
        lastOkAt: status === "ok" ? startedAt : null,
        lastStatus: status,
        lastDetail: detail,
        runCount: 1,
      },
      update: {
        lastRunAt: startedAt,
        ...(status === "ok" ? { lastOkAt: startedAt } : {}),
        lastStatus: status,
        lastDetail: detail,
        runCount: { increment: 1 },
      },
    });
  } catch (error) {
    logger.error("job_check_in_failed", { job, error: String(error) });
  }
}

/**
 * Liveness for every registered job.
 *
 * Returns a row per job whether or not it has ever run, so a job that was never wired up at
 * all is visible rather than simply missing from the report.
 */
export async function getJobLiveness(now = new Date()): Promise<JobLiveness[]> {
  const runs = await db.jobRun.findMany({
    select: { job: true, lastRunAt: true, lastOkAt: true, lastStatus: true },
  });
  const byJob = new Map(runs.map((run) => [run.job, run]));

  return CRON_JOB_NAMES.map((job) => assessJob(job, byJob.get(job) ?? null, now));
}

/** Jobs that have run before and then stopped, or that are failing every time. */
export function unhealthyJobs(liveness: JobLiveness[]): JobLiveness[] {
  return liveness.filter((job) => job.status === "stale" || job.status === "failing");
}
