/**
 * The scheduled jobs, and how long each may go quiet before that is a fault (QLT-04).
 *
 * Kept beside the workflow rather than derived from it: YAML carries the trigger, this
 * carries the reasoning, and the interesting number here is not the cron expression but how
 * long an absence is tolerable. A test asserts the two stay in step, because a schedule
 * changed in one place and not the other is how monitoring quietly starts watching for the
 * wrong interval and still reports green.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────────────┐
 * │ THESE ARE DRIVEN BY pg_cron, INSIDE SUPABASE. NOT BY VERCEL, AND NOT BY GITHUB.       │
 * │                                                                                      │
 * │ Registered by scripts/setup-pg-cron.ts, which reads the schedules below, and calling  │
 * │ scheduler.invoke_scheduled_job from the migration of the same name.                   │
 * │                                                                                      │
 * │ They lived in vercel.json first, until the Hobby tier refused any cron more frequent  │
 * │ than daily and rejected the whole DEPLOYMENT over it — so for two weeks nothing could │
 * │ ship at all. Then GitHub Actions, which was free and ran every five minutes on paper. │
 * │ In practice it delivers scheduled workflows best-effort and drops them under load: on │
 * │ 9 August 2026 consecutive runs of the five-minute job came 44, 16 and then 51+        │
 * │ minutes apart. pg_cron fired its first tick 0.22 seconds after the mark.              │
 * │                                                                                      │
 * │ What did NOT change is how the routes are driven: bearer CRON_SECRET in, check-in     │
 * │ recorded on the way out. That is why swapping the scheduler cost nothing but the      │
 * │ schedule itself — and why the check-in still has to exist, because a scheduler that   │
 * │ stops is silent whichever one it is.                                                  │
 * └──────────────────────────────────────────────────────────────────────────────────────┘
 */
export type CronJobName =
  | "session-reminders"
  | "expire-booking-requests"
  | "finalize-sessions"
  | "refresh-fx-rates"
  | "subscription-lifecycle"
  | "process-email-outbox";

export type CronJobDefinition = {
  /** Must match .github/workflows/scheduled-jobs.yml exactly. */
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
  "expire-booking-requests": {
    schedule: "*/10 * * * *",
    intervalMinutes: 10,
    consequence: "unanswered booking requests hold their slot forever and never expire",
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
 * How late the scheduler is allowed to be before lateness means something.
 *
 * Sized for GitHub Actions, which delivered runs whenever it got round to them. pg_cron is
 * punctual to a fraction of a second, so this is now more generous than it needs to be and
 * detection is correspondingly slower than it could be.
 *
 * Deliberately not tightened in the same change that moved the scheduler. The check-in depends
 * on an HTTP call completing, not merely on the tick firing, and there is no production data
 * yet on how long that tail runs. Tightening on a guess risks an alert that cries wolf, which
 * is worse than a slow one because it teaches whoever is on call to ignore the alert that
 * matters. Revisit with a week of cron.job_run_details to hand.
 */
const SCHEDULER_JITTER_MINUTES = 15;

/**
 * Grace before a late job counts as stale.
 *
 * One whole interval, so a single missed tick — a deploy, a cold start, a slow run — does
 * not page anyone, while a job that has genuinely stopped is caught within one further
 * interval. The backlog asks for detection "within one expected interval"; this is that,
 * plus a minute of slack so a job running at exactly its period does not flap, plus the
 * scheduler's own jitter now that delivery is somebody else's best effort.
 */
export function stalenessThresholdMinutes(job: CronJobName): number {
  return CRON_JOBS[job].intervalMinutes * 2 + 1 + SCHEDULER_JITTER_MINUTES;
}

export type JobLiveness = {
  job: CronJobName;
  /**
   * `unknown` means it has never run. Still not reported as stale HERE, because this sees one
   * job in isolation and cannot tell "never wired up" from "wired up a minute ago".
   *
   * That judgement needs the other jobs for context, so it lives in unhealthyJobs and
   * schedulerHasNeverRun instead. This comment used to claim the dangerous case — nothing ever
   * ran — was "caught by the separate secret check". It was not: that check only asks whether
   * the DEPLOYMENT holds a CRON_SECRET, which says nothing about whether any caller has it. On
   * 9 August 2026 the secret was present and correct, nothing was configured to use it, and
   * readiness stayed green through a total outage of everything scheduled.
   */
  status: "ok" | "stale" | "failing" | "unknown";
  /**
   * When this job FIRST checked in, which is not when it last did.
   *
   * The earliest of these across all jobs is the only honest answer to "since when should a
   * job have been running here": it is written once and never moves, while lastRunAt advances
   * on every tick and would carry a grace period forward for ever.
   */
  firstSeenAt: Date | null;
  lastRunAt: Date | null;
  lastOkAt: Date | null;
  minutesSinceLastOk: number | null;
  thresholdMinutes: number;
  consequence: string;
};

export function assessJob(
  job: CronJobName,
  run: { createdAt: Date; lastRunAt: Date; lastOkAt: Date | null; lastStatus: string } | null,
  now = new Date(),
): JobLiveness {
  const thresholdMinutes = stalenessThresholdMinutes(job);
  const consequence = CRON_JOBS[job].consequence;

  if (!run) {
    return {
      job,
      status: "unknown",
      firstSeenAt: null,
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
    firstSeenAt: run.createdAt,
    lastRunAt: run.lastRunAt,
    lastOkAt: run.lastOkAt,
    minutesSinceLastOk,
    thresholdMinutes,
    consequence,
  };
}
