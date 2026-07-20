import { headers } from "next/headers";

import { checkRateLimit, rateLimitMessage } from "@/lib/security/rate-limit";
import { fail, type ActionFailure } from "@/types/action";

export async function enforceActionRateLimit(input: {
  action: string;
  limit: number;
  windowMs: number;
  userId?: string;
}): Promise<ActionFailure | null> {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const identity = input.userId ?? forwarded ?? requestHeaders.get("x-real-ip") ?? "unknown";
  const result = await checkRateLimit({
    key: `action:${input.action}:${identity}`,
    limit: input.limit,
    windowMs: input.windowMs,
  });
  return result.success ? null : fail(rateLimitMessage(result), "RATE_LIMITED");
}
