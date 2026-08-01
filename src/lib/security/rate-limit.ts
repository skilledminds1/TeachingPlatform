import { Redis } from "@upstash/redis";

import { logger } from "@/lib/observability/logger";

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

let client: Redis | null = null;

export function hasSharedRateLimitStore(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

function upstash(): Redis | null {
  if (!hasSharedRateLimitStore()) return null;
  client ??= new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL as string,
    token: process.env.UPSTASH_REDIS_REST_TOKEN as string,
  });
  return client;
}

export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const redis = upstash();
  if (!redis) return memoryLimit(options);

  try {
    const windowSeconds = Math.max(1, Math.ceil(options.windowMs / 1_000));
    const count = await redis.incr(options.key);
    if (count === 1) await redis.expire(options.key, windowSeconds);
    const ttl = await redis.ttl(options.key);
    return {
      success: count <= options.limit,
      limit: options.limit,
      remaining: Math.max(0, options.limit - count),
      retryAfterSeconds: Math.max(1, ttl > 0 ? ttl : windowSeconds),
      degraded: false,
    };
  } catch (error) {
    logger.warn("rate_limit_provider_unavailable", { error });
    return memoryLimit(options);
  }
}

export function rateLimitMessage(result: RateLimitResult): string {
  return `Too many requests. Please try again in ${result.retryAfterSeconds} seconds.`;
}

export function resetMemoryRateLimits(): void {
  memory.clear();
}
