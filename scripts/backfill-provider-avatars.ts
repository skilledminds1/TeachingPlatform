/**
 * SEC-18: move avatars that are still pointing at an identity provider's CDN into our own
 * storage, so they render under img-src.
 *
 *   npm run avatars:backfill            # dry run — lists what it would change
 *   npm run avatars:backfill -- --yes   # actually write
 *
 * The code fix stops NEW sign-ins from storing a provider URL, but rows written before it
 * still hold one — and those are exactly the teachers whose pictures are blocked on
 * /find-tutor today. This script is the other half.
 *
 * Three outcomes per user:
 *
 *   restored   The avatars bucket already holds a photo they uploaded. That is the case the
 *              old per-request resync created: uploadTeacherAvatar wrote the User row only,
 *              and the next page view overwrote it from Google metadata while leaving the
 *              uploaded object in place. Their own photo is preferred over the provider's,
 *              and nothing is fetched.
 *   imported   Bytes copied from the provider into avatars/{userId}/.
 *   cleared    The URL is on a host the importer will not fetch from, or the fetch failed.
 *              It cannot render under this CSP either way, so the column is emptied and the
 *              initials fallback takes over instead of a broken image and a console
 *              violation on every page load.
 *
 * SAFETY. This writes real rows. It refuses to run without --yes, prints the database host
 * first, and will not touch a host in PROTECTED_HOSTS unless --i-know-this-is-production is
 * also passed, because .env.local on this project points at the live database that serves
 * amazing-skills.com.
 */
import { readFileSync } from "node:fs";

import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

import {
  AVATAR_BUCKET,
  importProviderAvatar,
  providerAvatarSource,
} from "../src/server/auth/provider-avatar";

/** Hosts that must never be written to without an explicit second acknowledgement. */
const PROTECTED_HOSTS = ["aws-0-eu-west-1.pooler.supabase.com"];

function loadEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
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
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey =
  env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = env.DATABASE_URL ?? process.env.DATABASE_URL;

if (!supabaseUrl || !serviceRoleKey || !databaseUrl) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or DATABASE_URL in .env.local.",
  );
  process.exit(1);
}

const apply = process.argv.includes("--yes");
const productionAcknowledged = process.argv.includes("--i-know-this-is-production");
const databaseHost = new URL(databaseUrl).host;

const db = new PrismaClient();
const storage = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
}).storage;

/** A URL we serve ourselves needs no work — it is already inside img-src. */
function isFirstParty(url: string): boolean {
  try {
    return new URL(url).origin === new URL(supabaseUrl!).origin;
  } catch {
    return false;
  }
}

/** The newest photo this user uploaded themselves, if the bucket still holds one. */
async function findUploadedAvatar(userId: string): Promise<string | null> {
  const { data } = await storage.from(AVATAR_BUCKET).list(userId);
  const uploads = (data ?? []).filter(
    (file) => file.id !== null && !file.name.startsWith("provider-"),
  );
  if (uploads.length === 0) return null;

  const newest = uploads.sort((a, b) =>
    (b.created_at ?? "").localeCompare(a.created_at ?? ""),
  )[0]!;
  const {
    data: { publicUrl },
  } = storage.from(AVATAR_BUCKET).getPublicUrl(`${userId}/${newest.name}`);
  return publicUrl;
}

async function main() {
  console.log(`database host: ${databaseHost}`);
  console.log(`supabase:      ${supabaseUrl}`);
  console.log(apply ? "mode:          APPLY\n" : "mode:          dry run\n");

  if (apply && PROTECTED_HOSTS.includes(databaseHost) && !productionAcknowledged) {
    console.error(
      `Refusing to write to ${databaseHost} without --i-know-this-is-production.`,
    );
    process.exit(1);
  }

  const users = await db.user.findMany({
    where: { avatarUrl: { not: null } },
    select: { id: true, email: true, avatarUrl: true },
  });

  const candidates = users.filter((user) => !isFirstParty(user.avatarUrl!));
  console.log(
    `${users.length} users with an avatar, ${candidates.length} not served from our own storage.\n`,
  );

  const counts = { restored: 0, imported: 0, cleared: 0, failed: 0 };

  for (const user of candidates) {
    const currentHost = (() => {
      try {
        return new URL(user.avatarUrl!).host;
      } catch {
        return "(unparseable)";
      }
    })();

    const uploaded = await findUploadedAvatar(user.id);
    const fetchable = providerAvatarSource(user.avatarUrl) !== null;

    let outcome: keyof typeof counts;
    let nextUrl: string | null = null;

    if (uploaded) {
      outcome = "restored";
      nextUrl = uploaded;
    } else if (!fetchable) {
      outcome = "cleared";
    } else if (!apply) {
      // Dry run does not fetch: it reports what it would attempt.
      outcome = "imported";
    } else {
      nextUrl = await importProviderAvatar({ userId: user.id, url: user.avatarUrl });
      outcome = nextUrl ? "imported" : "cleared";
      if (!nextUrl) counts.failed += 1;
    }

    counts[outcome] += 1;
    // The destination is printed because a dry run that only says "restored" is asking to be
    // trusted about which object it found.
    const destination = nextUrl
      ? nextUrl.slice(nextUrl.indexOf("/storage/"))
      : outcome === "imported"
        ? "(would fetch from the provider)"
        : "(no avatar — initials fallback)";
    console.log(`  ${outcome.padEnd(8)} ${user.email}  ${currentHost} -> ${destination}`);

    if (apply && (outcome === "restored" || nextUrl !== null || outcome === "cleared")) {
      await db.user.update({ where: { id: user.id }, data: { avatarUrl: nextUrl } });
    }
  }

  console.log(
    `\nrestored ${counts.restored}  imported ${counts.imported}  cleared ${counts.cleared}` +
      (counts.failed > 0 ? `  (${counts.failed} of the cleared were fetch failures)` : ""),
  );
  if (!apply && candidates.length > 0) {
    console.log("\nDry run. Re-run with -- --yes to write.");
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
