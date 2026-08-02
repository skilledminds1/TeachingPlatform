import { MessageSquare, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { AdminMessageDialog } from "@/features/admin/components/admin-message-dialog";
import { AdminPageHeader } from "@/features/admin/components/admin-page-header";
import { EmptyState } from "@/features/admin/components/empty-state";
import { StatusBadge } from "@/features/admin/components/status-badge";
import { formatDate, formatStatus } from "@/lib/format";
import { getAdminMessagingData } from "@/server/admin/messages";

export default async function AdminMessagesPage() {
  const { users, conversations } = await getAdminMessagingData();
  const conversationByRecipient = new Map(
    conversations.map((conversation) => [
      conversation.studentId,
      conversation,
    ]),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <AdminPageHeader
        title="Platform messages"
        description="Send official messages to any student or teacher. Messages are clearly marked as coming from the Platform Owner."
      />

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-amber-600" aria-hidden />
          <div>
            <h2 className="font-heading text-lg font-semibold">
              Recent conversations
            </h2>
            <p className="text-sm text-muted-foreground">
              Continue conversations and review replies.
            </p>
          </div>
        </div>

        {conversations.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {conversations.map((conversation) => {
              const latest = conversation.messages[0];
              return (
                <Link
                  key={conversation.id}
                  href={`/admin/messages/${conversation.id}`}
                  className="rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {conversation.student.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {conversation.student.email}
                      </p>
                    </div>
                    <p className="shrink-0 text-xs text-muted-foreground">
                      {formatDate(conversation.lastMessageAt)}
                    </p>
                  </div>
                  <p className="mt-3 truncate text-sm text-muted-foreground">
                    {latest?.body ?? "No messages yet"}
                  </p>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card">
            <EmptyState
              icon={MessageSquare}
              title="No platform conversations yet"
              description="Choose a user below to send the first official message."
            />
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border/60 px-5 py-4">
          <h2 className="font-heading text-lg font-semibold">All users</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Students and teachers with active platform accounts.
          </p>
        </div>
        {users.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No users"
            description="Registered users will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">User</th>
                  <th className="px-5 py-3 font-medium">Account type</th>
                  <th className="px-5 py-3 font-medium">Conversation</th>
                  <th className="px-5 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((user) => {
                  const conversation = conversationByRecipient.get(user.id);
                  const accountType = user.teacherProfile
                    ? "teacher"
                    : user.memberships[0]?.role ?? "student";
                  return (
                    <tr key={user.id}>
                      <td className="px-5 py-4">
                        <p className="font-medium">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge tone={user.teacherProfile ? "info" : "neutral"}>
                          {formatStatus(accountType)}
                        </StatusBadge>
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">
                        {conversation ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            render={<Link href={`/admin/messages/${conversation.id}`} />}
                          >
                            Open conversation
                          </Button>
                        ) : (
                          "Not started"
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <AdminMessageDialog
                          recipientId={user.id}
                          recipientName={user.name}
                          conversationId={conversation?.id}
                          buttonLabel={conversation ? "Send message" : "Start message"}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
