import { db } from "@/lib/db";
import { requireAuth } from "@/server/auth/session";

export async function getNotifications(limit = 30) {
  const user = await requireAuth();
  const [items, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    db.notification.count({
      where: { userId: user.id, readAt: null },
    }),
  ]);
  return { user, items, unreadCount };
}
