import { Bell } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/features/admin/components/empty-state";
import {
  MarkAllNotificationsButton,
  NotificationLink,
} from "@/features/notifications/components/notification-actions";
import { StudentNavWithNotifications } from "@/features/student-dashboard/components/student-nav-with-notifications";
import { TeacherNavWithNotifications } from "@/features/teacher-dashboard/components/teacher-nav-with-notifications";
import { formatDateTime } from "@/lib/format";
import { getNotifications } from "@/server/notifications/list";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const { user, items, unreadCount } = await getNotifications();
  const isTeacher = user.memberships.some(
    (membership) => membership.role === "admin" || membership.role === "instructor",
  );

  return (
    <div className="min-h-screen bg-muted/30">
      {isTeacher ? <TeacherNavWithNotifications /> : <StudentNavWithNotifications />}

      <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Notifications</h1>
            <p className="mt-1 text-sm text-muted-foreground">{unreadCount} unread</p>
          </div>
          {unreadCount > 0 ? <MarkAllNotificationsButton /> : null}
        </div>

        {items.length > 0 ? (
          <ul className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            {items.map((notification) => (
              <li key={notification.id} className="border-b border-border last:border-b-0">
                <NotificationLink id={notification.id} href={notification.href}>
                  <div
                    className={`px-5 py-4 transition-colors hover:bg-muted/40 ${
                      notification.readAt ? "" : "bg-primary/5"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{notification.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {notification.body}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDateTime(notification.createdAt, user.timezone)}
                      </span>
                    </div>
                  </div>
                </NotificationLink>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <EmptyState
              icon={Bell}
              title="No notifications yet"
              description="Booking updates, lesson reminders, and new messages will appear here."
            />
          </div>
        )}
      </main>
    </div>
  );
}
