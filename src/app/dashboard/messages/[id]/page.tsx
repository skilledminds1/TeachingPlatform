import { ArrowLeft, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  ConversationSidebar,
  type ConversationListItem,
} from "@/features/messaging/components/conversation-sidebar";
import { MessageComposer } from "@/features/messaging/components/message-composer";
import { StudentNavWithNotifications } from "@/features/student-dashboard/components/student-nav-with-notifications";
import { TeacherNavWithNotifications } from "@/features/teacher-dashboard/components/teacher-nav-with-notifications";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  getConversationsForUser,
  getConversationThread,
} from "@/server/messaging/conversations";

export const metadata: Metadata = { title: "Conversation" };

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, list] = await Promise.all([
    getConversationThread(id),
    getConversationsForUser(),
  ]);
  if (!data) notFound();

  const isTeacher = data.user.memberships.some(
    (membership) => membership.role === "admin" || membership.role === "instructor",
  );
  const otherRole = data.isPlatformConversation
    ? "Platform Owner"
    : isTeacher
      ? "student"
      : "teacher";

  const items: ConversationListItem[] = list.conversations.map((conversation) => ({
    id: conversation.id,
    name: conversation.other.name,
    avatarUrl: conversation.other.avatarUrl,
    preview: conversation.latest?.body ?? "No messages yet",
    dateLabel: formatDate(conversation.lastMessageAt),
    unread: conversation.id === data.conversation.id ? 0 : conversation.unread,
    platformOwner: conversation.isPlatformConversation,
  }));

  return (
    <div className="flex h-dvh flex-col bg-muted/20">
      <div className="shrink-0">
        {isTeacher ? <TeacherNavWithNotifications /> : <StudentNavWithNotifications />}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="hidden h-full md:block">
          <ConversationSidebar
            conversations={items}
            activeId={data.conversation.id}
            emptyHint={`Conversations with your ${otherRole}s will appear here.`}
          />
        </div>

        <section className="flex min-w-0 flex-1 flex-col bg-background/60">
          <div className="flex shrink-0 items-center gap-3 border-b border-border/60 bg-background px-4 py-3 md:px-6">
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden"
              render={<Link href="/dashboard/messages" />}
            >
              <ArrowLeft className="size-4" aria-hidden />
            </Button>
            <Avatar size="lg">
              {data.other.avatarUrl ? (
                <AvatarImage src={data.other.avatarUrl} alt="" />
              ) : null}
              <AvatarFallback>{initials(data.other.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-semibold">{data.other.name}</p>
                {data.isPlatformConversation ? (
                  <ShieldCheck className="size-4 text-amber-600" aria-hidden />
                ) : null}
              </div>
              <p
                className={`text-xs ${
                  data.isPlatformConversation
                    ? "font-semibold text-amber-700 dark:text-amber-400"
                    : "text-muted-foreground capitalize"
                }`}
              >
                {otherRole}
              </p>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-6 md:px-6">
            {data.conversation.messages.length > 0 ? (
              data.conversation.messages.map((message) => {
                const mine = message.senderId === data.user.id;
                const fromPlatformOwner = message.sender.isPlatformAdmin;
                return (
                  <div
                    key={message.id}
                    className={`flex ${mine ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm md:max-w-[70%] ${
                        fromPlatformOwner
                          ? "border border-amber-500/40 bg-amber-500/10 text-foreground shadow-sm"
                          : mine
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                      }`}
                    >
                      {fromPlatformOwner ? (
                        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                          <ShieldCheck className="size-3.5" aria-hidden />
                          Platform Owner
                        </p>
                      ) : null}
                      <p className="whitespace-pre-wrap">{message.body}</p>
                      <p
                        className={`mt-2 text-[11px] ${
                          mine && !fromPlatformOwner
                            ? "text-primary-foreground/70"
                            : "text-muted-foreground"
                        }`}
                      >
                        {formatDateTime(message.createdAt, data.user.timezone)}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">
                Say hello and share what you&apos;d like to work on.
              </p>
            )}
          </div>

          <div className="shrink-0 border-t border-border/60 bg-background p-4 md:px-6">
            <MessageComposer conversationId={data.conversation.id} />
          </div>
        </section>
      </div>
    </div>
  );
}
