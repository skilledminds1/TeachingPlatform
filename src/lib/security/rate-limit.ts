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
  };
}

function upstash(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
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
