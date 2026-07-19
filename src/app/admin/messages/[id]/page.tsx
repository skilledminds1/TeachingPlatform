import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { AdminMessageComposer } from "@/features/admin/components/admin-message-composer";
import { formatDateTime } from "@/lib/format";
import { getAdminMessageThread } from "@/server/admin/messages";

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U"
  );
}

export default async function AdminMessageThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getAdminMessageThread(id);
  if (!data) notFound();

  const { admin, conversation } = data;
  const recipientRole = conversation.student.teacherProfile
    ? "Teacher"
    : "Student";

  return (
    <div className="mx-auto flex h-[calc(100dvh-7rem)] max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <header className="flex shrink-0 items-center gap-3 border-b border-border/60 px-4 py-3 md:px-6">
        <Button
          size="sm"
          variant="ghost"
          render={<Link href="/admin/messages" />}
        >
          <ArrowLeft className="size-4" aria-hidden />
          Messages
        </Button>
        <div className="h-8 w-px bg-border" aria-hidden />
        <Avatar size="lg">
          {conversation.student.avatarUrl ? (
            <AvatarImage src={conversation.student.avatarUrl} alt="" />
          ) : null}
          <AvatarFallback>{initials(conversation.student.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {conversation.student.name}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {recipientRole} · {conversation.student.email}
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-background/50 px-4 py-6 md:px-6">
        {conversation.messages.map((message) => {
          const fromOwner = message.sender.isPlatformAdmin;
          return (
            <div
              key={message.id}
              className={`flex ${fromOwner ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm md:max-w-[70%] ${
                  fromOwner
                    ? "border border-amber-500/40 bg-amber-500/10 shadow-sm"
                    : "bg-muted"
                }`}
              >
                {fromOwner ? (
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                    <ShieldCheck className="size-3.5" aria-hidden />
                    Platform Owner
                  </p>
                ) : (
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">
                    {conversation.student.name}
                  </p>
                )}
                <p className="whitespace-pre-wrap">{message.body}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {formatDateTime(message.createdAt, admin.timezone)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="shrink-0 border-t border-border/60 bg-background p-4 md:px-6">
        <AdminMessageComposer conversationId={conversation.id} />
      </div>
    </div>
  );
}
