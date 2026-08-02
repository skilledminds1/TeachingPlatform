/**
 * The scheduled jobs, and how long each may go quiet before that is a fault (QLT-04).
 *
 * Kept beside vercel.json rather than derived from it: vercel.json is JSON and cannot carry
 * a comment, and the interesting number here is not the cron expression but how long an
 * absence is tolerable. A test asserts the two stay in step, because a schedule changed in
 * one place and not the other is how monitoring quietly starts watching the wrong thing.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────────────┐
 * │ SCHEDULE FREQUENCY REQUIRES A PAID VERCEL PLAN.                                       │
 * │                                                                                      │
 * │ Vercel's Hobby tier permits ONE cron job, invoked at most once per day. Everything    │
 * │ below running every 5, 10 or 15 minutes needs Pro or above. On Hobby they do not      │
 * │ fire at all — and because a job that never fires produces no error, the platform      │
 * │ would look healthy while silently sending no reminders and expiring no payments.      │
 * │ That is the failure this file exists to make visible; it is not a substitute for      │
 * │ being on a plan that actually runs them.                                              │
 * └──────────────────────────────────────────────────────────────────────────────────────┘
 */
export type CronJobName =
  | "session-reminders"
  | "expire-pending-payments"
  | "finalize-sessions"
  | "refresh-fx-rates"
  | "subscription-lifecycle"
  | "process-email-outbox";

export type CronJobDefinition = {
  /** Must match vercel.json exactly. */
  schedule: string;
  /** How often it is expected to run. */
  intervalMinutes: number;
  /** What stops happening when it does. Used in the alert, so it says why anyone cares. */
  consequence: string;
};

export const CRON_JOBS: Record<CronJobName, CronJobDefinition> = {
  "session-reminders": {
    schedule: "*/15 * * * *",
    intervalMinutes: 15,
    consequence: "students and teachers stop receiving lesson reminders",
  },
  "expire-pending-payments": {
    schedule: "*/10 * * * *",
    intervalMinutes: 10,
    consequence: "abandoned checkouts hold their slot forever and never expire",
  },
  "finalize-sessions": {
    schedule: "*/15 * * * *",
    intervalMinutes: 15,
    consequence: "completed lessons are never finalised, so payouts and reviews stall",
  },
  "refresh-fx-rates": {
    schedule: "30 5 * * *",
    intervalMinutes: 24 * 60,
    consequence:
      "marketplace price ranking drifts on stale rates (INT-09, INT-11, INT-12)",
  },
  "subscription-lifecycle": {
    schedule: "15 2 * * *",
    intervalMinutes: 24 * 60,
    consequence: "grace periods and dunning never advance, so revenue is lost silently",
  },
  "process-email-outbox": {
    schedule: "*/5 * * * *",
    intervalMinutes: 5,
    consequence: "no transactional email is sent at all",
  },
};

export const CRON_JOB_NAMES = Object.keys(CRON_JOBS) as CronJobName[];

/**
 * Grace before a late job counts as stale.
 *
 * One whole interval, so a single missed tick — a deploy, a cold start, a slow run — does
 * not page anyone, while a job that has genuinely stopped is caught within one further
 * interval. The backlog asks for detection "within one expected interval"; this is that,
 * plus a minute of slack so a job running at exactly its period does not flap.
 */
export function stalenessThresholdMinutes(job: CronJobName): number {
  return CRON_JOBS[job].intervalMinutes * 2 + 1;
}

export type JobLiveness = {
  job: CronJobName;
  /**
   * `unknown` means it has never run. That is NOT reported as stale: a fresh deploy would
   * otherwise alarm on every job before the first tick. The case it might hide — a
   * CRON_SECRET so wrong that nothing ever ran — is caught by the separate secret check,
   * which fails readiness in production outright.
   */
  status: "ok" | "stale" | "failing" | "unknown";
  lastRunAt: Date | null;
  lastOkAt: Date | null;
  minutesSinceLastOk: number | null;
  thresholdMinutes: number;
  consequence: string;
};

export function assessJob(
  job: CronJobName,
  run: { lastRunAt: Date; lastOkAt: Date | null; lastStatus: string } | null,
  now = new Date(),
): JobLiveness {
  const thresholdMinutes = stalenessThresholdMinutes(job);
  const consequence = CRON_JOBS[job].consequence;

  if (!run) {
    return {
      job,
      status: "unknown",
      lastRunAt: null,
      lastOkAt: null,
      minutesSinceLastOk: null,
      thresholdMinutes,
      consequence,
    };
  }

  // Measured from the last SUCCESS, not the last attempt. A job firing on schedule and
  // failing every time is exactly as dead as one that never fires.
  const minutesSinceLastOk = run.lastOkAt
    ? (now.getTime() - run.lastOkAt.getTime()) / 60_000
    : null;

  const status: JobLiveness["status"] =
    minutesSinceLastOk === null
      ? "failing"
      : minutesSinceLastOk > thresholdMinutes
        ? "stale"
        : "ok";

  return {
    job,
    status,
    lastRunAt: run.lastRunAt,
    lastOkAt: run.lastOkAt,
    minutesSinceLastOk,
    thresholdMinutes,
    consequence,
  };
}
