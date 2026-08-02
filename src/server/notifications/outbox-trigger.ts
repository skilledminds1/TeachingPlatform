import { after } from "next/server";

import { logger } from "@/lib/observability/logger";

/**
 * Drain the email outbox immediately after the response, with the cron as the backstop
 * (QLT-04).
 *
 * The outbox is written during a user-facing request and drained by a cron every 5 minutes,
 * so a password reset or booking confirmation could sit unsent for most of those 5 minutes.
 * Worse, that schedule is the one most dependent on the hosting plan: a five-minute cron does
 * not fire at all on Vercel's Hobby tier, and the failure is silent — no transactional email
 * is sent and nothing throws.
 *
 * Sending after the response rather than inline keeps the provider off the request's critical
 * path: the user's action does not get slower because an SMTP handshake was slow, and it does
 * not fail because the provider was down.
 *
 * THE CRON IS STILL REQUIRED. This runs inside the same serverless invocation, so it is lost
 * if that invocation is recycled, times out, or crashes. It also cannot deliver anything
 * scheduled for later — a retry backed off to `nextAttemptAt` in the future is only ever
 * picked up by the cron. This makes the common case fast; the cron is what makes delivery
 * eventual. Both are needed.
 */

/**
 * How many messages one request will try to drain.
 *
 * After-response work still occupies the invocation and counts against its timeout, so a
 * backlog must not turn a single enqueue into a multi-minute drain. Ten covers any realistic
 * fan-out from one action (both parties on a booking, every admin on an organization) and
 * leaves the rest to the cron.
 */
export const AFTER_RESPONSE_DRAIN_LIMIT = 10;

/**
 * Queue a drain to run once the current response has been sent.
 *
 * Safe to call more than once per request and safe to overlap with the cron: processEmailOutbox
 * claims each row with a conditional update and skips any row it did not win, so a duplicate
 * drain finds nothing rather than sending twice.
 */
export function scheduleOutboxDrain(): void {
  try {
    after(async () => {
      try {
        // Imported here rather than at module scope: process-outbox imports retryDelayMs back
        // out of email-outbox, which imports this module. Deferring breaks that cycle.
        const { processEmailOutbox } = await import("@/server/notifications/process-outbox");
        await processEmailOutbox({ limit: AFTER_RESPONSE_DRAIN_LIMIT });
      } catch (error) {
        // The message is already durable in the outbox and the cron will retry it. Failing
        // loudly here would report an error for something that has not actually been lost.
        logger.error("email_outbox_after_response_drain_failed", { error });
      }
    });
  } catch {
    // No response to run after — a script, a seed, a test, a background task. Nothing to do:
    // the row is durable and the cron drains it.
  }
}
