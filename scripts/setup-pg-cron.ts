/**
 * Register the scheduled jobs with pg_cron, for one environment.
 *
 * The migration creates the extensions and scheduler.invoke_scheduled_job. This puts the two
 * per-environment values into Vault and registers one cron entry per job. It is separate from
 * the migration because a migration lives in the repository, and CRON_SECRET must not.
 *
 * The schedules are read from CRON_JOBS rather than written out again here. The registry is
 * already the thing the staleness thresholds and the liveness report are derived from, so a
 * schedule changed there takes effect everywhere on the next run of this script — the failure
 * this avoids is monitoring that watches for one interval while the scheduler fires on another
 * and everything still reports green.
 *
 * Idempotent: cron.schedule replaces an entry of the same name, and the Vault writes update in
 * place. Safe to re-run after any registry change, and required after one.
 *
 *   npm run cron:setup            # dry run, prints what it would do
 *   npm run cron:setup -- --yes   # apply
 */
import { PrismaClient } from "@prisma/client";

import { CRON_JOBS, CRON_JOB_NAMES } from "../src/server/jobs/registry";

const apply = process.argv.includes("--yes");

// The direct connection, not the pooler: this creates extensions-adjacent objects and writes
// Vault secrets, and the pooler is the wrong place to do session-scoped work.
const db = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
});

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required. Load it from .env.local before running this.`);
  }
  return value.trim();
}

async function main(): Promise<void> {
  const cronSecret = required("CRON_SECRET");
  // No trailing slash: the function concatenates "/api/v1/jobs/<name>" onto this.
  const appUrl = required("NEXT_PUBLIC_APP_URL").replace(/\/+$/, "");

  if (!appUrl.startsWith("https://")) {
    throw new Error(`NEXT_PUBLIC_APP_URL must be https for pg_net to reach it, got ${appUrl}`);
  }

  console.log(apply ? "Applying pg_cron setup" : "DRY RUN — pass --yes to apply");
  console.log(`  base url: ${appUrl}`);
  console.log(`  jobs:     ${CRON_JOB_NAMES.length}`);
  for (const job of CRON_JOB_NAMES) {
    console.log(`    ${job.padEnd(26)} ${CRON_JOBS[job].schedule}`);
  }

  if (!apply) {
    await db.$disconnect();
    return;
  }

  // Vault has no upsert, so replace rather than accumulate duplicates under the same name.
  for (const [name, value] of [
    ["cron_secret", cronSecret],
    ["app_base_url", appUrl],
  ] as const) {
    await db.$executeRawUnsafe(`DELETE FROM vault.secrets WHERE name = $1`, name);
    // queryRaw, not executeRaw: vault.create_secret and cron.schedule are SELECTs that return
    // a row, and Prisma's execute path rejects a statement that produces results.
    await db.$queryRawUnsafe(`SELECT vault.create_secret($1, $2)`, value, name);
    console.log(`  vault: ${name} stored`);
  }

  for (const job of CRON_JOB_NAMES) {
    // Job name doubles as the cron entry name, so re-running replaces rather than duplicates.
    await db.$queryRawUnsafe(
      `SELECT cron.schedule($1, $2, $3)`,
      job,
      CRON_JOBS[job].schedule,
      `SELECT scheduler.invoke_scheduled_job('${job}')`,
    );
    console.log(`  scheduled: ${job.padEnd(26)} ${CRON_JOBS[job].schedule}`);
  }

  const registered = await db.$queryRawUnsafe<Array<{ jobname: string; schedule: string; active: boolean }>>(
    `SELECT jobname, schedule, active FROM cron.job ORDER BY jobname`,
  );
  console.log("\nRegistered in cron.job:");
  for (const row of registered) {
    console.log(`  ${row.jobname.padEnd(26)} ${row.schedule.padEnd(14)} active=${row.active}`);
  }

  const missing = CRON_JOB_NAMES.filter((job) => !registered.some((row) => row.jobname === job));
  if (missing.length > 0) {
    throw new Error(`These jobs are in the registry but not scheduled: ${missing.join(", ")}`);
  }

  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(String(error instanceof Error ? error.message : error));
  await db.$disconnect();
  process.exit(1);
});
