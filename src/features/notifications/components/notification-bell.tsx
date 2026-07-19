"use client";

import { Popover } from "@base-ui/react/popover";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  fetchNotificationInbox,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationInboxItem,
} from "@/actions/notifications";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type NotificationBellData = {
  items: NotificationInboxItem[];
  unreadCount: number;
  timezone: string;
};

export function NotificationBell({ initial }: { initial: NotificationBellData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(initial.items);
  const [unreadCount, setUnreadCount] = useState(initial.unreadCount);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [isPending, startTransition] = useTransition();

  function refreshInbox(): void {
    startTransition(async () => {
      const result = await fetchNotificationInbox(12);
      if (!result.success) return;
      setItems(result.data.items);
      setUnreadCount(result.data.unreadCount);
      setTimezone(result.data.timezone);
    });
  }

  function handleOpenChange(next: boolean): void {
    setOpen(next);
    if (next) refreshInbox();
  }

  function openNotification(item: NotificationInboxItem): void {
    startTransition(async () => {
      await markNotificationRead(item.id);
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry,
        ),
      );
      setUnreadCount((count) => (item.readAt ? count : Math.max(0, count - 1)));
      setOpen(false);
      if (item.href) router.push(item.href);
      else router.refresh();
    });
  }

  function markAllRead(): void {
    startTransition(async () => {
      const result = await markAllNotificationsRead();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setItems((current) =>
        current.map((entry) => ({
          ...entry,
          readAt: entry.readAt ?? new Date().toISOString(),
        })),
      );
      setUnreadCount(0);
      router.refresh();
    });
  }

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="relative"
            aria-label={
              unreadCount > 0
                ? `Notifications, ${unreadCount} unread`
                : "Notifications"
            }
          />
        }
      >
        <Bell className="size-4" aria-hidden />
        {unreadCount > 0 ? (
          <span
            className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white ring-2 ring-background"
            aria-hidden
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
          <Popover.Popup
            className={cn(
              "w-[min(100vw-1.5rem,22rem)] overflow-hidden rounded-xl border border-border bg-background shadow-lg outline-none",
              "origin-[var(--transform-origin)] transition-[transform,scale,opacity]",
              "data-ending-style:scale-95 data-ending-style:opacity-0",
              "data-starting-style:scale-95 data-starting-style:opacity-0",
            )}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Notifications</p>
                <p className="text-xs text-muted-foreground">
                  {isPending ? "Updating…" : `${unreadCount} unread`}
                </p>
              </div>
              {unreadCount > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={isPending}
                  onClick={markAllRead}
                >
                  Mark all read
                </Button>
              ) : null}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No notifications yet.
                </p>
              ) : (
                <ul>
                  {items.map((item) => (
                    <li key={item.id} className="border-b border-border last:border-b-0">
                      <button
                        type="button"
                        className={cn(
                          "w-full px-4 py-3 text-left transition-colors hover:bg-muted/50",
                          !item.readAt && "bg-primary/5",
                        )}
                        onClick={() => openNotification(item)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{item.title}</p>
                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                              {item.body}
                            </p>
                          </div>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {formatDateTime(item.createdAt, timezone)}
                          </span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-border px-3 py-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center"
                render={<Link href="/dashboard/notifications" />}
                onClick={() => setOpen(false)}
              >
                View all notifications
              </Button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
