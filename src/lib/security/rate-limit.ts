import { db } from "@/lib/db";
import { logger } from "@/lib/observability/logger";

/**
 * Rate limiting, backed by the application's own Postgres.
 *
 * This used Upstash Redis. Postgres is not a performance upgrade — Redis is better at this
 * workload — but it removes a failure mode instead of adding one. With a separate store, an
 * Upstash outage made `enforceActionRateLimit` fail closed on credential actions: signup,
 * signin and password reset all returning "temporarily unavailable" while every other page
 * served 200s and monitoring stayed green. Sharing the database the app already cannot run
 * without collapses "the store is down" and "the app is down" into a single condition, which
 * is one fewer way to be broken in a way nobody notices.
 *
 * THE TRADE, WRITTEN DOWN: rate limiting is write-heavy on the auth path, and it matters most
 * under attack — precisely when those writes compete for the same connection pool serving the
 * site. At current volume that is theoretical. If it stops being theoretical, everything here
 * is behind `checkRateLimit` and moving back is a contained change.
 */

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  /**
   * True when the count came from this instance's memory rather than the shared store.
   *
   * On serverless every instance holds its own Map and cold starts reset it, so a degraded
   * result is close to no protection at all against a distributed or merely parallel
   * attacker. Callers guarding credentials must fail closed on this — see
   * `enforceActionRateLimit`.
   */
  degraded: boolean;
};

type Entry = { count: number; resetAt: number };
const memory = new Map<string, Entry>();

function memoryLimit(options: RateLimitOptions, now = Date.now()): RateLimitResult {
  const current = memory.get(options.key);
  const entry =
    !current || current.resetAt <= now
      ? { count: 0, resetAt: now + options.windowMs }
      : current;
  entry.count += 1;
  memory.set(options.key, entry);
  return {
    success: entry.count <= options.limit,
    limit: options.limit,
    remaining: Math.max(0, options.limit - entry.count),
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1_000)),
    degraded: true,
  };
}

/**
 * Is a store shared across instances configured?
 *
 * Now simply "is there a database", which in production there always is — so a misconfigured
 * limiter can no longer silently disable itself while the app keeps running. That was the
 * whole point of moving it.
 */
export function hasSharedRateLimitStore(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

type CounterRow = { count: number; reset_at: Date };

/**
 * Count one request against a key.
 *
 * ONE statement, deliberately. `INSERT ... ON CONFLICT DO UPDATE` takes a row lock, so two
 * requests arriving together cannot both read the old count and both write count+1 — which is
 * exactly the race a read-then-write would lose, and losing it means the limiter under-counts
 * under concurrency, i.e. it fails at the only moment it exists for.
 *
 * The window is evaluated with the DATABASE's clock, not the instance's. Serverless instances
 * drift, and a limiter whose window boundary depends on which machine answered is not a
 * limiter.
 */
export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  if (!hasSharedRateLimitStore()) return memoryLimit(options);

  const windowSeconds = Math.max(1, Math.ceil(options.windowMs / 1_000));

  try {
    const rows = await db.$queryRaw<CounterRow[]>`
      INSERT INTO rate_limits (key, count, reset_at, updated_at)
      VALUES (${options.key}, 1, now() + make_interval(secs => ${windowSeconds}), now())
      ON CONFLICT (key) DO UPDATE SET
        count = CASE
          WHEN rate_limits.reset_at <= now() THEN 1
          ELSE rate_limits.count + 1
        END,
        reset_at = CASE
          WHEN rate_limits.reset_at <= now()
            THEN now() + make_interval(secs => ${windowSeconds})
          ELSE rate_limits.reset_at
        END,
        updated_at = now()
      RETURNING count, reset_at
    `;

    const row = rows[0];
    if (!row) return memoryLimit(options);

    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((row.reset_at.getTime() - Date.now()) / 1_000),
    );
    return {
      success: row.count <= options.limit,
      limit: options.limit,
      remaining: Math.max(0, options.limit - row.count),
      retryAfterSeconds,
      degraded: false,
    };
  } catch (error) {
    // Falling back to memory is degraded, and callers guarding credentials refuse to proceed
    // on a degraded result. Throwing instead would turn a database blip into a total outage
    // of every rate-limited action.
    logger.warn("rate_limit_store_unavailable", { error });
    return memoryLimit(options);
  }
}

/**
 * Remove counters whose window has long passed.
 *
 * Redis expired keys itself; Postgres does not, so rows accumulate — one per key per window.
 * Nothing depends on this running promptly: an expired row is already inert, because every
 * read compares `reset_at` against `now()`. It exists so the table does not grow without
 * bound, which is why an hour of slack is deliberate rather than sloppy.
 */
export async function deleteExpiredRateLimits(): Promise<number> {
  try {
    const deleted = await db.$executeRaw`
      DELETE FROM rate_limits WHERE reset_at < now() - interval '1 hour'
    `;
    return deleted;
  } catch (error) {
    logger.warn("rate_limit_sweep_failed", { error });
    return 0;
  }
}

export function rateLimitMessage(result: RateLimitResult): string {
  return `Too many requests. Please try again in ${result.retryAfterSeconds} seconds.`;
}

export function resetMemoryRateLimits(): void {
  memory.clear();
}
