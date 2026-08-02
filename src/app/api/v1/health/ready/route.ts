import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { logger } from "@/lib/observability/logger";
import { isAuthorizedBearer } from "@/lib/security/cron-auth";
import { getJobLiveness, unhealthyJobs } from "@/server/jobs/check-in";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * QLT-04: this checked the database and nothing else, so the question it was most likely to
 * be asked — "are the scheduled jobs still running?" — was the one it could not answer.
 *
 * Both additions are about ABSENCES rather than errors, which is the failure mode nothing
 * else on this platform catches: a missing CRON_SECRET 401s every job forever, and a job
 * that stops firing produces no exception for Sentry to report and no line for anyone to
 * read. The only evidence is that something quietly stopped happening.
 */
export async function GET(request: Request) {
  const secret = process.env.HEALTH_SECRET ?? process.env.CRON_SECRET;
  if (!isAuthorizedBearer(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isProduction = process.env.NODE_ENV === "production";

  const dependencies = {
    database: false,
    supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    redis: Boolean(
      process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
    ),
    sentry: Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
    // isCronAuthorized fails closed without this. Correct security, and a total outage of
    // everything scheduled — with no error anywhere to say so.
    cronSecret: Boolean(process.env.CRON_SECRET),
  };

  try {
    await db.$queryRaw`SELECT 1`;
    dependencies.database = true;
  } catch {
    return NextResponse.json(
      { ok: false, service: "amazing-skills", dependencies, jobs: [] },
      { status: 503 },
    );
  }

  const jobs = await getJobLiveness();
  const stalled = unhealthyJobs(jobs);

  // Only a fault in production: locally the jobs are invoked by hand.
  const cronSecretMissing = isProduction && !dependencies.cronSecret;
  const ok = !cronSecretMissing && stalled.length === 0;

  if (!ok) {
    // Logged as well as returned, so this reaches the tracker even when whatever polls this
    // endpoint is itself the thing that has stopped.
    logger.error("readiness_check_failed", {
      cronSecretMissing,
      stalledJobs: stalled.map((job) => ({
        job: job.job,
        status: job.status,
        minutesSinceLastOk: job.minutesSinceLastOk,
        consequence: job.consequence,
      })),
    });
  }

  return NextResponse.json(
    {
      ok,
      service: "amazing-skills",
      dependencies,
      cronSecretMissing,
      jobs: jobs.map((job) => ({
        job: job.job,
        status: job.status,
        lastOkAt: job.lastOkAt,
        minutesSinceLastOk:
          job.minutesSinceLastOk === null ? null : Math.round(job.minutesSinceLastOk),
        thresholdMinutes: job.thresholdMinutes,
        // Carried on the failing entries so whoever reads the alert knows whether it can
        // wait until morning.
        ...(job.status === "ok" || job.status === "unknown"
          ? {}
          : { consequence: job.consequence }),
      })),
    },
    { status: ok ? 200 : 503 },
  );
}
