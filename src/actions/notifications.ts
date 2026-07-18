"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAuth } from "@/server/auth/session";
import { fail, ok, type ActionResult } from "@/types/action";

export async function markNotificationRead(
  notificationId: string,
): Promise<ActionResult<{ read: true }>> {
  const parsed = z.uuid().safeParse(notificationId);
  if (!parsed.success) return fail("Invalid notification.", "VALIDATION_ERROR");
  const user = await requireAuth();
  const notification = await db.notification.findFirst({
    where: { id: parsed.data, userId: user.id },
    select: { id: true },
  });
  if (!notification) return fail("Notification not found.", "NOT_FOUND");

  await db.notification.update({
    where: { id: notification.id },
    data: { readAt: new Date() },
  });
  revalidatePath("/dashboard/notifications");
  return ok({ read: true });
}

export async function markAllNotificationsRead(): Promise<ActionResult<{ updated: number }>> {
  const user = await requireAuth();
  const result = await db.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/dashboard/notifications");
  return ok({ updated: result.count });
}
