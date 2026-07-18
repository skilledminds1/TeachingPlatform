import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { MessageComposer } from "@/features/messaging/components/message-composer";
import { formatDateTime } from "@/lib/format";
import { getConversationThread } from "@/server/messaging/conversations";

export const metadata: Metadata = { title: "Conversation" };

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getConversationThread(id);
  if (!data) notFound();

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-6">
          <Button variant="ghost" render={<Link href="/dashboard/messages" />}>
            <ArrowLeft className="size-4" aria-hidden />
            All messages
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        <div>
          <p className="text-sm text-muted-foreground">Conversation</p>
          <h1 className="text-3xl font-semibold tracking-tight">{data.other.name}</h1>
        </div>

        <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
          {data.conversation.messages.length > 0 ? (
            data.conversation.messages.map((message) => {
              const mine = message.senderId === data.user.id;
              return (
                <div
                  key={message.id}
                  className={`flex ${mine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                      mine
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.body}</p>
                    <p
                      className={`mt-2 text-[11px] ${
                        mine ? "text-primary-foreground/70" : "text-muted-foreground"
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
        </section>

        <MessageComposer conversationId={data.conversation.id} />
      </main>
    </div>
  );
}
