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
    select: { job: true, createdAt: true, lastRunAt: true, lastOkAt: true, lastStatus: true },
  });
  const byJob = new Map(runs.map((run) => [run.job, run]));

  return CRON_JOB_NAMES.map((job) => assessJob(job, byJob.get(job) ?? null, now));
}

/**
 * Jobs that are demonstrably not running.
 *
 * Three shapes rather than two:
 *
 *   `stale`   — ran before, then stopped.
 *   `failing` — fires on schedule and fails every time.
 *   `unknown` — has never run at all. Counted only once the scheduler has PROVED it can reach
 *               this deployment, by some other job checking in, and enough time has passed
 *               since that proof for this job's own schedule to have come round. Before that
 *               it is genuinely unknown: a daily job wired up at 10:00 has not failed because
 *               it has not run by 10:05.
 *
 * The `unknown` arm catches a single job that was never wired up while its five siblings tick
 * away happily — the case where "has never run" is unambiguous rather than merely young.
 */
export function unhealthyJobs(liveness: JobLiveness[], now = new Date()): JobLiveness[] {
  // firstSeenAt, NOT lastRunAt. lastRunAt advances on every tick, so a healthy job would drag
  // this anchor along with it, the grace period below would never once expire, and a job that
  // was never wired up would go unreported for ever — the silence this exists to break.
  const schedulerFirstWorkedAt = liveness.reduce<Date | null>(
    (earliest, job) =>
      job.firstSeenAt !== null && (earliest === null || job.firstSeenAt < earliest)
        ? job.firstSeenAt
        : earliest,
    null,
  );

  return liveness.filter((job) => {
    if (job.status === "stale" || job.status === "failing") return true;
    if (job.status !== "unknown" || schedulerFirstWorkedAt === null) return false;
    const minutesSinceSchedulerWorked = (now.getTime() - schedulerFirstWorkedAt.getTime()) / 60_000;
    return minutesSinceSchedulerWorked > job.thresholdMinutes;
  });
}

/**
 * True when NOT ONE job has ever checked in.
 *
 * The failure this exists for, because nothing else catches it: the deployment holds a
 * perfectly valid CRON_SECRET — so dependencies.cronSecret is true and readiness is satisfied
 * — while nothing anywhere is configured to CALL the job routes. Every job then reads
 * `unknown` for ever, `unknown` was not a fault, and readiness stays green throughout.
 *
 * That was the live state on 9 August 2026: the GitHub Actions workflow ran 136 times and
 * failed every one at its own config gate, missing PRODUCTION_APP_URL and CRON_SECRET, so no
 * job route was ever reached. No reminders, no booking expiry, no dunning, no email outbox
 * drain — and /api/v1/health/ready reported ok the entire time.
 *
 * Deliberately given no grace period. There is nothing honest to measure one from: a
 * serverless process is seconds old on every cold start, so uptime says nothing about how long
 * the environment has existed. None is needed either — JobRun rows outlive deployments, so
 * this can only be true of a production environment whose scheduler has never once worked,
 * which is exactly what should not be called ready. It clears at the first check-in, one tick
 * away for the five-minute job.
 */
export function schedulerHasNeverRun(liveness: JobLiveness[]): boolean {
  return liveness.every((job) => job.firstSeenAt === null);
}
