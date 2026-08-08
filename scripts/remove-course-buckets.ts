/**
 * Empty and delete the three course storage buckets.
 *
 * The 20260808120000_remove_courses migration drops the course tables and the storage
 * policies, but it cannot touch the objects: Supabase installs a `storage.protect_delete()`
 * trigger that raises on any direct DELETE against storage.objects, so bucket cleanup has to
 * go through the Storage API. That is what this script is for.
 *
 *   npm run storage:remove-course-buckets           # dry run — lists what it would delete
 *   npm run storage:remove-course-buckets -- --yes  # actually delete
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local. The service role bypasses
 * RLS, which is the point — the policies granting access to these buckets are already gone.
 */
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

const BUCKETS = ["course-covers", "course-media", "course-files"] as const;
const PAGE_SIZE = 100;

function loadEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const i = trimmed.indexOf("=");
    const key = trimmed.slice(0, i).trim();
    let value = trimmed.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const env = loadEnv(".env.local");
const url = env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey =
  env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.",
  );
  process.exit(1);
}

const apply = process.argv.includes("--yes");
const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

/**
 * Walk a bucket depth-first. `list` returns one directory level at a time and marks folders
 * with a null id, so a flat listing would silently miss every nested object — and the course
 * media layout was `{userId}/{courseId}/{lessonId}/file`, four levels deep.
 */
async function listAllPaths(bucket: string, prefix = ""): Promise<string[]> {
  const paths: string[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: PAGE_SIZE, offset });

    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) {
        paths.push(...(await listAllPaths(bucket, path)));
      } else {
        paths.push(path);
      }
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return paths;
}

async function main(): Promise<void> {
  const { data: existing, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    console.error(`Could not list buckets: ${listError.message}`);
    process.exit(1);
  }
  const present = new Set((existing ?? []).map((b) => b.name));

  let totalObjects = 0;

  for (const bucket of BUCKETS) {
    if (!present.has(bucket)) {
      console.log(`${bucket}: already gone`);
      continue;
    }

    const paths = await listAllPaths(bucket);
    totalObjects += paths.length;
    console.log(`${bucket}: ${paths.length} object(s)`);

    if (!apply) {
      for (const path of paths.slice(0, 10)) console.log(`   would delete ${path}`);
      if (paths.length > 10) console.log(`   ... and ${paths.length - 10} more`);
      continue;
    }

    // remove() caps at 1000 keys per call.
    for (let i = 0; i < paths.length; i += 1000) {
      const batch = paths.slice(i, i + 1000);
      const { error } = await supabase.storage.from(bucket).remove(batch);
      if (error) throw new Error(`remove from ${bucket}: ${error.message}`);
      console.log(`   deleted ${batch.length} object(s)`);
    }

    const { error: deleteError } = await supabase.storage.deleteBucket(bucket);
    if (deleteError) throw new Error(`deleteBucket ${bucket}: ${deleteError.message}`);
    console.log(`   bucket removed`);
  }

  if (!apply) {
    console.log(
      `\nDry run. ${totalObjects} object(s) across ${BUCKETS.length} bucket(s).` +
        `\nRe-run with -- --yes to delete.`,
    );
  } else {
    console.log("\nDone.");
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
