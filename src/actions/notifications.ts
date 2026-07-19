"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAuth } from "@/server/auth/session";
import { getNotifications } from "@/server/notifications/list";
import { fail, ok, type ActionResult } from "@/types/action";

function revalidateNotificationViews() {
  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard/teacher");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/messages");
  revalidatePath("/dashboard/classroom");
  revalidatePath("/admin");
}

export type NotificationInboxItem = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export async function fetchNotificationInbox(
  limit = 12,
): Promise<
  ActionResult<{
    items: NotificationInboxItem[];
    unreadCount: number;
    timezone: string;
  }>
> {
  try {
    const { user, items, unreadCount } = await getNotifications(limit);
    return ok({
      unreadCount,
      timezone: user.timezone,
      items: items.map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        href: item.href,
        readAt: item.readAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
      })),
    });
  } catch {
    return fail("Could not load notifications.", "UNAUTHORIZED");
  }
}

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
  revalidateNotificationViews();
  return ok({ read: true });
}

export async function markAllNotificationsRead(): Promise<ActionResult<{ updated: number }>> {
  const user = await requireAuth();
  const result = await db.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidateNotificationViews();
  return ok({ updated: result.count });
}
