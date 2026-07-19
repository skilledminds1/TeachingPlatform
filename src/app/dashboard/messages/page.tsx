import { ArrowLeft, Bell, MessageSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  ConversationSidebar,
  type ConversationListItem,
} from "@/features/messaging/components/conversation-sidebar";
import { TeacherNav } from "@/features/teacher-dashboard/components/teacher-nav";
import { formatDate } from "@/lib/format";
import { getConversationsForUser } from "@/server/messaging/conversations";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  const { user, conversations } = await getConversationsForUser();
  const isTeacher = user.memberships.some(
    (membership) => membership.role === "admin" || membership.role === "instructor",
  );
  const backHref = isTeacher ? "/dashboard/teacher" : "/dashboard";
  const otherRole = isTeacher ? "student" : "teacher";

  const items: ConversationListItem[] = conversations.map((conversation) => ({
    id: conversation.id,
    name: conversation.other.name,
    avatarUrl: conversation.other.avatarUrl,
    preview: conversation.latest?.body ?? "No messages yet",
    dateLabel: formatDate(conversation.lastMessageAt),
    unread: conversation.unread,
  }));

  return (
    <div className="flex h-dvh flex-col bg-muted/20">
      {isTeacher ? (
        <div className="shrink-0">
          <TeacherNav />
        </div>
      ) : (
        <header className="shrink-0 border-b border-border/60 bg-background">
          <div className="flex h-16 items-center justify-between px-4 md:px-6">
            <Button variant="ghost" size="sm" render={<Link href={backHref} />}>
              <ArrowLeft className="size-4" aria-hidden />
              Dashboard
            </Button>
            <h1 className="font-heading text-base font-semibold">Messages</h1>
            <Button
              variant="ghost"
              size="sm"
              render={<Link href="/dashboard/notifications" />}
            >
              <Bell className="size-4" aria-hidden />
              <span className="hidden sm:inline">Notifications</span>
            </Button>
          </div>
        </header>
      )}

      <div className="flex min-h-0 flex-1">
        <ConversationSidebar
          conversations={items}
          emptyHint={`Conversations with your ${otherRole}s will appear here.`}
        />

        <section className="hidden min-w-0 flex-1 items-center justify-center bg-background/60 md:flex">
          <div className="mx-auto max-w-sm px-6 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <MessageSquare className="size-5" aria-hidden />
            </div>
            <h2 className="mt-4 text-sm font-semibold">
              Select a {otherRole} to start a conversation
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a conversation from the list to read and reply to messages.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
