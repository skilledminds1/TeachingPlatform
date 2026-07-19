import { MessageSquare } from "lucide-react";
import type { Metadata } from "next";

import {
  ConversationSidebar,
  type ConversationListItem,
} from "@/features/messaging/components/conversation-sidebar";
import { StudentNavWithNotifications } from "@/features/student-dashboard/components/student-nav-with-notifications";
import { TeacherNavWithNotifications } from "@/features/teacher-dashboard/components/teacher-nav-with-notifications";
import { formatDate } from "@/lib/format";
import { getConversationsForUser } from "@/server/messaging/conversations";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  const { user, conversations } = await getConversationsForUser();
  const isTeacher = user.memberships.some(
    (membership) => membership.role === "admin" || membership.role === "instructor",
  );
  const otherRole = isTeacher ? "student" : "teacher";

  const items: ConversationListItem[] = conversations.map((conversation) => ({
    id: conversation.id,
    name: conversation.other.name,
    avatarUrl: conversation.other.avatarUrl,
    preview: conversation.latest?.body ?? "No messages yet",
    dateLabel: formatDate(conversation.lastMessageAt),
    unread: conversation.unread,
    platformOwner: conversation.isPlatformConversation,
  }));

  return (
    <div className="flex h-dvh flex-col bg-muted/20">
      <div className="shrink-0">
        {isTeacher ? <TeacherNavWithNotifications /> : <StudentNavWithNotifications />}
      </div>

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
