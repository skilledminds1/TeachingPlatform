import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  assessJob,
  CRON_JOBS,
  CRON_JOB_NAMES,
  stalenessThresholdMinutes,
  type CronJobName,
} from "./registry";

/**
 * QLT-04. isCronAuthorized returns false whenever CRON_SECRET is undefined — correct
 * fail-closed security — but the variable is optional, so a missing or mistyped value makes
 * all six jobs 401 forever. Reminders stop sending, abandoned payments never expire, grace
 * periods and dunning never advance.
 *
 * Every one of those failures is an ABSENCE. No exception is thrown, so Sentry sees nothing;
 * no line is written, so logs show nothing; the platform serves traffic perfectly while
 * quietly doing none of its scheduled work. That is why this is the one thing on the
 * platform that has to be monitored by check-in rather than by error.
 */
const minutesAgo = (minutes: number, now = new Date()) =>
  new Date(now.getTime() - minutes * 60_000);

describe("the registry matches what the scheduler is actually told to run", () => {
  const WORKFLOW_PATH = ".github/workflows/scheduled-jobs.yml";
  const WORKFLOW = readFileSync(WORKFLOW_PATH, "utf8");

  /** The job → schedule map the workflow dispatches from. */
  function workflowJobSchedules(): Map<string, string> {
    const match = WORKFLOW.match(/JOB_SCHEDULES:\s*'(\{.*\})'/);
    if (!match) throw new Error(`No JOB_SCHEDULES mapping in ${WORKFLOW_PATH}`);
    return new Map(Object.entries(JSON.parse(match[1]) as Record<string, string>));
  }

  /** The cron expressions the workflow actually wakes up on. */
  function workflowTriggers(): string[] {
    const block = WORKFLOW.split("workflow_dispatch")[0];
    return [...block.matchAll(/^\s*-\s*cron:\s*"([^"]+)"/gm)].map((m) => m[1]);
  }

  /**
   * The reasoning lives in the registry because YAML carries the trigger and not the why.
   * A schedule changed in one place and not the other is how monitoring silently starts
   * watching for the wrong interval — and still reports green.
   */
  it("declares the same schedule as the workflow, for every job", () => {
    const scheduled = workflowJobSchedules();

    expect([...scheduled.keys()].sort()).toEqual([...CRON_JOB_NAMES].sort());
    for (const job of CRON_JOB_NAMES) {
      expect(scheduled.get(job), `${job} schedule`).toBe(CRON_JOBS[job].schedule);
    }
  });

  /**
   * The mapping decides what runs; the `on.schedule` list decides whether anything runs at
   * all. A job added to the mapping without its trigger is wired up everywhere a reader would
   * look and still never fires.
   */
  it("wakes up on every distinct schedule it dispatches", () => {
    const triggers = workflowTriggers();
    const needed = [...new Set(CRON_JOB_NAMES.map((job) => CRON_JOBS[job].schedule))];

    expect(triggers.length).toBeGreaterThan(0);
    for (const schedule of needed) {
      expect(triggers, `no trigger for "${schedule}"`).toContain(schedule);
    }
    // And nothing fires that dispatches nothing, which would fail the run every time.
    for (const trigger of triggers) {
      expect(needed, `trigger "${trigger}" matches no job`).toContain(trigger);
    }
  });

  /**
   * Vercel's Hobby tier rejects the whole deployment over a sub-daily cron, so a crons block
   * here does not merely fail to run — it stops anything from shipping at all.
   */
  it("keeps the schedules out of vercel.json", () => {
    let vercelJson: string | null = null;
    try {
      vercelJson = readFileSync("vercel.json", "utf8");
    } catch {
      return; // No vercel.json at all is the state this moved to.
    }
    expect(vercelJson).not.toContain("crons");
  });

  it("says what breaks for every job, so an alert is actionable", () => {
    for (const job of CRON_JOB_NAMES) {
      expect(CRON_JOBS[job].consequence.length, `${job} needs a consequence`).toBeGreaterThan(20);
      expect(CRON_JOBS[job].intervalMinutes).toBeGreaterThan(0);
    }
  });
});

describe("staleness", () => {
  const job: CronJobName = "process-email-outbox";

  it("is healthy when it ran recently", () => {
    const result = assessJob(
      job,
      { lastRunAt: minutesAgo(3), lastOkAt: minutesAgo(3), lastStatus: "ok" },
    );
    expect(result.status).toBe("ok");
  });

  /**
   * The backlog asks for detection within one expected interval. One whole interval of
   * grace means a single missed tick — a deploy, a cold start — does not page anyone, while
   * a job that genuinely stopped is caught on the next one.
   */
  it("tolerates one missed tick, then reports stale", () => {
    const threshold = stalenessThresholdMinutes(job);
    expect(assessJob(job, {
      lastRunAt: minutesAgo(threshold - 1),
      lastOkAt: minutesAgo(threshold - 1),
      lastStatus: "ok",
    }).status).toBe("ok");

    expect(assessJob(job, {
      lastRunAt: minutesAgo(threshold + 1),
      lastOkAt: minutesAgo(threshold + 1),
      lastStatus: "ok",
    }).status).toBe("stale");
  });

  /**
   * A job firing exactly on schedule and failing every time is as dead as one that never
   * fires, and measuring from lastRunAt alone would call it healthy forever.
   */
  it("measures from the last SUCCESS, not the last attempt", () => {
    const result = assessJob(job, {
      lastRunAt: minutesAgo(1),
      lastOkAt: null,
      lastStatus: "failed",
    });
    expect(result.status).toBe("failing");
  });

  /**
   * A fresh deploy has no runs yet. Reporting that as stale would alarm on every job before
   * the first tick and teach whoever is on call to ignore the alert.
   */
  it("does not alarm on a job that has never run", () => {
    expect(assessJob(job, null).status).toBe("unknown");
  });

  it("scales the threshold with each job's own interval", () => {
    // A daily job must not be called stale after twenty minutes.
    expect(stalenessThresholdMinutes("refresh-fx-rates")).toBeGreaterThan(
      stalenessThresholdMinutes("process-email-outbox"),
    );
  });
});

describe("check-in only counts real runs", () => {
  const CHECK_IN = readFileSync("src/server/jobs/check-in.ts", "utf8");

  /**
   * The failure being monitored is a missing CRON_SECRET, which produces a 401. If a 401
   * counted as a check-in, the monitoring would cheerfully confirm the exact outage it
   * exists to catch.
   */
  it("never records a 401 as a run", () => {
    expect(CHECK_IN).toMatch(/response\.status !== 401/);
  });

  it("records success only on a 2xx", () => {
    expect(CHECK_IN).toMatch(/if \(response\.ok\)/);
  });

  it("does not let a monitoring write break the job it monitors", () => {
    // A job that did its work and failed to write a monitoring row has still done its work.
    expect(CHECK_IN).toMatch(/logger\.error\("job_check_in_failed"/);
  });
});

describe("every job route checks in", () => {
  it("wraps all six, or the unwrapped one reports healthy forever", () => {
    for (const job of CRON_JOB_NAMES) {
      const route = readFileSync(`src/app/api/v1/jobs/${job}/route.ts`, "utf8");
      expect(route.includes("withJobCheckIn"), `${job} route must check in`).toBe(true);
      expect(route).toContain(`"${job}"`);
    }
  });
});

describe("readiness reports what it can now answer", () => {
  const READY = readFileSync("src/app/api/v1/health/ready/route.ts", "utf8");

  it("fails in production when the cron secret is absent", () => {
    expect(READY).toMatch(/isProduction && !dependencies\.cronSecret/);
    expect(READY).toMatch(/status: ok \? 200 : 503/);
  });

  it("fails when a job has stalled", () => {
    expect(READY).toContain("unhealthyJobs");
    expect(READY).toMatch(/stalled\.length === 0/);
  });

  it("logs as well as returns, in case the poller is what stopped", () => {
    expect(READY).toMatch(/logger\.error\("readiness_check_failed"/);
  });
});
