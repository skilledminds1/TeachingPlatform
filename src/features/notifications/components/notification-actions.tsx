"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { markAllNotificationsRead, markNotificationRead } from "@/actions/notifications";
import { Button } from "@/components/ui/button";

export function MarkAllNotificationsButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await markAllNotificationsRead();
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          router.refresh();
        })
      }
    >
      {isPending ? "Updating…" : "Mark all read"}
    </Button>
  );
}

export function NotificationLink({
  id,
  href,
  children,
}: {
  id: string;
  href: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="w-full text-start"
      onClick={() =>
        startTransition(async () => {
          await markNotificationRead(id);
          if (href) router.push(href);
          else router.refresh();
        })
      }
    >
      {children}
    </button>
  );
}
