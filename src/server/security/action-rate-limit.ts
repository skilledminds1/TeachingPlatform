import { headers } from "next/headers";

import { logger } from "@/lib/observability/logger";
import {
  checkRateLimit,
  hasSharedRateLimitStore,
  rateLimitMessage,
} from "@/lib/security/rate-limit";
import { fail, type ActionFailure } from "@/types/action";

/**
 * Derive the client identity for rate limiting.
 *
 * SEC-07: this previously read `x-forwarded-for.split(",")[0]` — the LEFTMOST hop, which is
 * whatever the client sent. An attacker could therefore vary that header per request and get
 * a fresh bucket every time, defeating the limit completely even when Redis was healthy.
 *
 * The trustworthy value is the one appended by our own edge, which is the RIGHTMOST hop.
 * Prefer headers the platform sets and overwrites (Vercel replaces `x-vercel-forwarded-for`
 * and `x-real-ip` on every request, so a client cannot forge them) and only fall back to
 * parsing XFF from the right.
 */
export function clientIdentityFromHeaders(requestHeaders: Headers): string | null {
  const platformIp =
    requestHeaders.get("x-vercel-forwarded-for") ?? requestHeaders.get("x-real-ip");
  if (platformIp?.trim()) return platformIp.trim();

  const forwarded = requestHeaders.get("x-forwarded-for");
  if (!forwarded) return null;
  const hops = forwarded
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);
  return hops.at(-1) ?? null;
}

export async function enforceActionRateLimit(input: {
  action: string;
  limit: number;
  windowMs: number;
  userId?: string;
  /**
   * Extra identifier to bucket on alongside the caller, e.g. the submitted email on
   * sign-in. Without it a distributed attacker spreads attempts across many IPs and never
   * trips a per-IP limit while hammering a single account.
   */
  identifier?: string;
  /**
   * Set for actions guarding credentials. When no shared store is configured in production
   * these fail closed instead of silently relying on per-instance memory, which is close to
   * no protection at all on serverless.
   */
  critical?: boolean;
}): Promise<ActionFailure | null> {
  const requestHeaders = await headers();
  const identity = input.userId ?? clientIdentityFromHeaders(requestHeaders) ?? "unknown";

  if (input.critical && !hasSharedRateLimitStore() && process.env.NODE_ENV === "production") {
    logger.error("rate_limit_store_unavailable_for_critical_action", {
      action: input.action,
    });
    return fail(
      "This service is temporarily unavailable. Please try again shortly.",
      "RATE_LIMITED",
    );
  }

  const buckets = [`action:${input.action}:${identity}`];
  if (input.identifier) {
    buckets.push(`action:${input.action}:id:${input.identifier.toLowerCase()}`);
  }

  const results = await Promise.all(
    buckets.map((key) =>
      checkRateLimit({ key, limit: input.limit, windowMs: input.windowMs }),
    ),
  );

  const blocked = results.find((result) => !result.success);
  return blocked ? fail(rateLimitMessage(blocked), "RATE_LIMITED") : null;
}
