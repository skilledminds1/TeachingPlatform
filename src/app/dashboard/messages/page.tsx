import { ArrowLeft, Bell, MessageSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/features/admin/components/empty-state";
import { formatDateTime } from "@/lib/format";
import { getConversationsForUser } from "@/server/messaging/conversations";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  const { user, conversations } = await getConversationsForUser();
  const backHref = user.memberships.some(
    (membership) => membership.role === "admin" || membership.role === "instructor",
  )
    ? "/dashboard/teacher"
    : "/dashboard";

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <Button variant="ghost" render={<Link href={backHref} />}>
            <ArrowLeft className="size-4" aria-hidden />
            Dashboard
          </Button>
          <Button variant="ghost" render={<Link href="/dashboard/notifications" />}>
            <Bell className="size-4" aria-hidden />
            Notifications
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
        <div>
          <p className="text-sm text-muted-foreground">Communication</p>
          <h1 className="text-3xl font-semibold tracking-tight">Messages</h1>
        </div>

        {conversations.length > 0 ? (
          <ul className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            {conversations.map((conversation) => (
              <li key={conversation.id} className="border-b border-border last:border-b-0">
                <Link
                  href={`/dashboard/messages/${conversation.id}`}
                  className="flex items-start justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{conversation.other.name}</p>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {conversation.latest?.body ?? "No messages yet"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(conversation.lastMessageAt, user.timezone)}
                    </p>
                    {conversation.unread > 0 ? (
                      <span className="mt-2 inline-flex rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                        New
                      </span>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <EmptyState
              icon={MessageSquare}
              title="No conversations yet"
              description="Message a teacher after booking a lesson, or wait for a student to reach out."
            />
          </div>
        )}
      </main>
    </div>
  );
}
