import { createHash } from "node:crypto";

import { db } from "@/lib/db";

export const EMAIL_CATEGORIES = [
  "transactional",
  "reminders",
  "messages",
  "marketing",
  "security",
  "payment",
  "legal",
  "admin_mediation",
] as const;

export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

const MANDATORY_CATEGORIES = new Set<EmailCategory>([
  "transactional",
  "security",
  "payment",
  "legal",
  "admin_mediation",
]);

export type NotificationPreference = {
  emailReminders: boolean;
  emailMessages: boolean;
  emailMarketing: boolean;
};

export function isEmailAllowed(
  category: EmailCategory,
  preference: NotificationPreference | null | undefined,
): boolean {
  if (MANDATORY_CATEGORIES.has(category)) return true;
  if (category === "reminders") return preference?.emailReminders ?? true;
  if (category === "messages") return preference?.emailMessages ?? false;
  return preference?.emailMarketing ?? false;
}

export function buildEmailIdempotencyKey(...parts: Array<string | number>): string {
  const canonical = parts.map(String).join(":");
  return `email:${createHash("sha256").update(canonical).digest("hex")}`;
}

export async function enqueueEmail(input: {
  userId?: string;
  recipient: string;
  subject: string;
  html: string;
  category: EmailCategory;
  idempotencyKey: string;
  maxAttempts?: number;
}): Promise<{ enqueued: boolean; id?: string }> {
  if (input.userId) {
    const preference = await db.userNotificationPreference.findUnique({
      where: { userId: input.userId },
      select: { emailReminders: true, emailMessages: true, emailMarketing: true },
    });
    if (!isEmailAllowed(input.category, preference)) return { enqueued: false };
  }

  const item = await db.emailOutbox.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    update: {},
    create: {
      userId: input.userId,
      recipient: input.recipient,
      subject: input.subject,
      html: input.html,
      category: input.category,
      idempotencyKey: input.idempotencyKey,
      maxAttempts: input.maxAttempts ?? 5,
    },
    select: { id: true, createdAt: true, updatedAt: true },
  });
  return { enqueued: item.createdAt.getTime() === item.updatedAt.getTime(), id: item.id };
}

export function retryDelayMs(attempt: number): number {
  const base = 60_000;
  return Math.min(base * 2 ** Math.max(0, attempt - 1), 24 * 60 * 60_000);
}
