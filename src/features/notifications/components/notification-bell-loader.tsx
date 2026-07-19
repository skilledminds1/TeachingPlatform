import { getNotifications } from "@/server/notifications/list";

import {
  NotificationBell,
  type NotificationBellData,
} from "./notification-bell";

export async function loadNotificationBellData(
  limit = 12,
): Promise<NotificationBellData> {
  const { user, items, unreadCount } = await getNotifications(limit);
  return {
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
  };
}

export async function NotificationBellLoader() {
  const initial = await loadNotificationBellData();
  return (
    <NotificationBell
      key={`${initial.unreadCount}-${initial.items[0]?.createdAt ?? "empty"}`}
      initial={initial}
    />
  );
}
