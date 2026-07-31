"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import {
  notificationPreferenceSchema,
  type NotificationPreferences,
} from "@/lib/validations/notification-preferences";
import { requireAuth } from "@/server/auth/session";
import { enforceActionRateLimit } from "@/server/security/action-rate-limit";
import { fail, ok, type ActionResult } from "@/types/action";

// NOTE: every export in this file is a publicly callable RPC endpoint. Read helpers belong
// in @/server/notifications/preferences, not here — see SEC-06.

export async function updateNotificationPreferences(
  input: unknown,
): Promise<ActionResult<NotificationPreferences>> {
  const parsed = notificationPreferenceSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid notification preferences.", "VALIDATION_ERROR");
  const user = await requireAuth();
  const limited = await enforceActionRateLimit({
    action: "notification-preferences",
    userId: user.id,
    limit: 10,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const preference = await db.userNotificationPreference.upsert({
    where: { userId: user.id },
    update: parsed.data,
    create: { userId: user.id, ...parsed.data },
    select: {
      emailReminders: true,
      emailMessages: true,
      emailMarketing: true,
    },
  });
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/teacher/settings");
  return ok(preference);
}
