"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAuth } from "@/server/auth/session";
import { enforceActionRateLimit } from "@/server/security/action-rate-limit";
import { fail, ok, type ActionResult } from "@/types/action";

const preferenceSchema = z.object({
  emailReminders: z.boolean(),
  emailMessages: z.boolean(),
  emailMarketing: z.boolean(),
});

export type NotificationPreferences = z.infer<typeof preferenceSchema>;

export async function updateNotificationPreferences(
  input: unknown,
): Promise<ActionResult<NotificationPreferences>> {
  const parsed = preferenceSchema.safeParse(input);
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

export async function getNotificationPreferences(
  userId: string,
): Promise<NotificationPreferences> {
  return (
    (await db.userNotificationPreference.findUnique({
      where: { userId },
      select: {
        emailReminders: true,
        emailMessages: true,
        emailMarketing: true,
      },
    })) ?? { emailReminders: true, emailMessages: false, emailMarketing: false }
  );
}
