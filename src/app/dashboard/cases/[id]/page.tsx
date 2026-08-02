import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { StudentNavWithNotifications } from "@/features/student-dashboard/components/student-nav-with-notifications";
import { TeacherNavWithNotifications } from "@/features/teacher-dashboard/components/teacher-nav-with-notifications";
import { AppealForm, CaseMessageForm } from "@/features/trust/components/trust-forms";
import { formatDateTime, formatStatus } from "@/lib/format";
import {
  hasTeacherMembership,
  isAccountHardRestricted,
  requireAuthenticatedIdentity,
} from "@/server/auth/session";
import { getParticipantCase } from "@/server/trust/cases";

export const metadata: Metadata = { title: "Case mediation" };

export default async function ParticipantCasePage({ params }: { params: Promise<{ id: string }> }) {
  const [user, route] = await Promise.all([requireAuthenticatedIdentity(), params]);
  const item = await getParticipantCase(route.id, user.id);
  if (!item) notFound();
  const isHardRestricted = isAccountHardRestricted(user);

  return (
    <div className="min-h-screen bg-muted/30">
      {isHardRestricted ? (
        <header className="border-b bg-background px-6 py-4">
          <Button render={<Link href="/account-restricted" />} variant="outline">Back to account status</Button>
        </header>
      ) : hasTeacherMembership(user) ? <TeacherNavWithNotifications /> : <StudentNavWithNotifications />}
      <main id="main-content" className="mx-auto max-w-4xl space-y-6 px-6 py-10">
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">{item.title}</h1>
            <span className="rounded-full bg-muted px-2 py-1 text-xs">{formatStatus(item.status)}</span>
          </div>
          <p className="mt-2 text-muted-foreground">{item.summary}</p>
        </header>

        {item.type === "refund" ? (
          <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-semibold">Mediation only — Amazing Skills does not hold teacher funds</p>
            <p className="mt-1">
              Students, teachers, and platform admins share this thread to discuss the request. Admins can review conduct and enforce account rules, but cannot move money, initiate a refund, or guarantee repayment.
            </p>
          </section>
        ) : null}

        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Shared case conversation</h2>
          <p className="mt-1 text-xs text-muted-foreground">Messages here are visible to all case participants and platform admins.</p>
          <div className="my-5 space-y-3">
            {item.messages.map((message) => (
              <article key={message.id} className="rounded-lg bg-muted/60 p-3">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-semibold">
                    {message.sender.isPlatformAdmin ? `Platform Owner / Admin · ${message.sender.name}` : message.sender.name}
                  </span>
                  <span className="text-muted-foreground">{formatDateTime(message.createdAt, user.timezone)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{message.body}</p>
              </article>
            ))}
            {!item.messages.length ? <p className="text-sm text-muted-foreground">No messages yet.</p> : null}
          </div>
          <CaseMessageForm caseId={item.id} />
        </section>

        {item.evidence.length ? (
          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">Case evidence</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {item.evidence.map((evidence) => (
                <li key={evidence.id}>
                  {evidence.fileName} · {evidence.mimeType} · uploaded by{" "}
                  {evidence.uploadedBy.isPlatformAdmin ? "Platform Owner / Admin" : evidence.uploadedBy.name}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {item.sanctions.map((sanction) => (
          <section key={sanction.id} className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">{formatStatus(sanction.type)} action</h2>
            <p className="mt-2 text-sm">{sanction.reason}</p>
            {sanction.appeals.length ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Appeal status: {formatStatus(sanction.appeals[0]!.status)}
              </p>
            ) : (
              <div className="mt-4"><AppealForm sanctionId={sanction.id} /></div>
            )}
          </section>
        ))}
      </main>
    </div>
  );
}
