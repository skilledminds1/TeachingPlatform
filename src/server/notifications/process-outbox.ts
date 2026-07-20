import { db } from "@/lib/db";
import { logger } from "@/lib/observability/logger";
import { getEmailProvider } from "@/services/email";
import type { EmailProvider } from "@/services/email/provider";
import { retryDelayMs } from "@/server/notifications/email-outbox";

export type OutboxProcessSummary = {
  candidates: number;
  sent: number;
  retried: number;
  failed: number;
};

async function reportTerminalFailure(error: unknown, outboxId: string): Promise<void> {
  logger.error("email_delivery_terminal_failure", { error, outboxId });
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureException(error, { tags: { subsystem: "email-outbox" }, extra: { outboxId } });
}

export async function processEmailOutbox(input?: {
  now?: Date;
  limit?: number;
  provider?: EmailProvider;
}): Promise<OutboxProcessSummary> {
  const now = input?.now ?? new Date();
  const limit = Math.min(Math.max(input?.limit ?? 50, 1), 100);
  const provider = input?.provider ?? getEmailProvider();
  const staleLock = new Date(now.getTime() - 15 * 60_000);
  const candidates = await db.emailOutbox.findMany({
    where: {
      OR: [
        { status: "pending", nextAttemptAt: { lte: now } },
        { status: "processing", lockedAt: { lte: staleLock } },
      ],
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: limit,
  });
  const summary: OutboxProcessSummary = {
    candidates: candidates.length,
    sent: 0,
    retried: 0,
    failed: 0,
  };

  for (const item of candidates) {
    const claimed = await db.emailOutbox.updateMany({
      where: {
        id: item.id,
        OR: [
          { status: "pending", nextAttemptAt: { lte: now } },
          { status: "processing", lockedAt: { lte: staleLock } },
        ],
      },
      data: { status: "processing", lockedAt: now },
    });
    if (!claimed.count) continue;

    const attempt = item.attempts + 1;
    try {
      const result = await provider.send({
        to: item.recipient,
        subject: item.subject,
        html: item.html,
        idempotencyKey: item.idempotencyKey,
      });
      await db.$transaction([
        db.emailOutbox.update({
          where: { id: item.id },
          data: {
            status: "sent",
            attempts: attempt,
            sentAt: now,
            lockedAt: null,
            lastError: null,
            providerMessageId: result.messageId,
          },
        }),
        db.emailDeliveryLog.create({
          data: {
            outboxId: item.id,
            attempt,
            status: "sent",
            provider: provider.name,
            providerMessageId: result.messageId,
          },
        }),
      ]);
      summary.sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 2_000) : "Unknown error";
      const terminal = attempt >= item.maxAttempts;
      await db.$transaction([
        db.emailOutbox.update({
          where: { id: item.id },
          data: {
            status: terminal ? "failed" : "pending",
            attempts: attempt,
            nextAttemptAt: terminal
              ? item.nextAttemptAt
              : new Date(now.getTime() + retryDelayMs(attempt)),
            lockedAt: null,
            lastError: message,
          },
        }),
        db.emailDeliveryLog.create({
          data: {
            outboxId: item.id,
            attempt,
            status: terminal ? "failed" : "retrying",
            provider: provider.name,
            error: message,
          },
        }),
      ]);
      if (terminal) {
        summary.failed += 1;
        await reportTerminalFailure(error, item.id);
      } else {
        summary.retried += 1;
      }
    }
  }
  return summary;
}
