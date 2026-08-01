import { notFound } from "next/navigation";

import {
  AdminCaseControls,
  AppealReviewForm,
  CaseMessageForm,
  PrivateCaseNoteForm,
} from "@/features/trust/components/trust-forms";
import { formatDateTime, formatStatus } from "@/lib/format";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/server/auth/session";
import { getAdminCase } from "@/server/trust/cases";

export default async function AdminCasePage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin();
  const route = await params;
  const [item, admins] = await Promise.all([
    getAdminCase(route.id),
    db.user.findMany({
      where: { isPlatformAdmin: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  if (!item) notFound();
  const subjectId = item.refundRequest?.teacherId ?? item.subjectId;

  return (
    <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">{item.title}</h1>
            <span className="rounded-full bg-muted px-2 py-1 text-xs">{formatStatus(item.status)}</span>
          </div>
          <p className="mt-2 text-muted-foreground">{item.summary}</p>
        </header>
        {item.type === "refund" ? (
          <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-semibold">Platform mediation only</p>
            <p className="mt-1">
              Amazing Skills does not possess the teacher&apos;s funds. No action on this page initiates a payment or refund.
            </p>
          </section>
        ) : null}
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Shared participant thread</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Student, teacher, assigned admin, and other authorized platform admins can read these messages.
          </p>
          <div className="my-5 space-y-3">
            {item.messages.map((message) => (
              <article key={message.id} className="rounded-lg bg-muted/60 p-3">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-semibold">
                    {message.sender.isPlatformAdmin ? `Platform Owner / Admin · ${message.sender.name}` : message.sender.name}
                  </span>
                  <span className="text-muted-foreground">{formatDateTime(message.createdAt, admin.timezone)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{message.body}</p>
              </article>
            ))}
          </div>
          <CaseMessageForm caseId={item.id} />
        </section>

        <section className="rounded-xl border border-dashed bg-card p-5">
          <h2 className="font-semibold">Private admin notes</h2>
          <div className="my-4 space-y-3">
            {item.notes.map((note) => (
              <article key={note.id} className="rounded-lg bg-muted p-3 text-sm">
                <p className="whitespace-pre-wrap">{note.body}</p>
                <p className="mt-2 text-xs text-muted-foreground">{note.author.name} · {formatDateTime(note.createdAt, admin.timezone)}</p>
              </article>
            ))}
          </div>
          <PrivateCaseNoteForm caseId={item.id} />
        </section>

        {item.appeals.length ? (
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Case appeals</h2>
            {item.appeals.map((appeal) => (
              <article key={appeal.id} className="rounded-xl border bg-card p-5">
                <p className="font-medium">
                  {appeal.appellant.name} · {formatStatus(appeal.sanction.type)}
                </p>
                <p className="mt-2 text-sm">{appeal.reason}</p>
                {["submitted", "under_review"].includes(appeal.status) ? (
                  <div className="mt-4"><AppealReviewForm appealId={appeal.id} /></div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {formatStatus(appeal.status)} · {appeal.decision}
                  </p>
                )}
              </article>
            ))}
          </section>
        ) : null}
      </div>
      <aside className="h-fit rounded-xl border bg-card p-5 shadow-sm xl:sticky xl:top-24">
        <AdminCaseControls
          caseId={item.id}
          subjectId={subjectId}
          initialStatus={item.status}
          initialPriority={item.priority}
          initialAssignee={item.assignedAdminId}
          admins={admins}
        />
      </aside>
    </div>
  );
}
