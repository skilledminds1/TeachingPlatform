import Link from "next/link";

import { Button } from "@/components/ui/button";
import { AdminPageHeader } from "@/features/admin/components/admin-page-header";
import { AppealReviewForm } from "@/features/trust/components/trust-forms";
import { formatDateTime, formatStatus } from "@/lib/format";
import { db } from "@/lib/db";

export default async function AdminAppealsPage() {
  const appeals = await db.appeal.findMany({
    orderBy: { submittedAt: "desc" },
    include: {
      appellant: { select: { name: true, email: true } },
      sanction: { select: { type: true, reason: true } },
      case: { select: { id: true, title: true } },
    },
  });
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <AdminPageHeader title="Enforcement appeals" description="Review account actions with a reasoned, audited decision." />
      <Button render={<Link href="/admin/trust" />} variant="outline">Back to Trust & Safety</Button>
      {appeals.map((appeal) => (
        <article key={appeal.id} className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{appeal.appellant.name} · {formatStatus(appeal.sanction.type)}</p>
            <span className="rounded-full bg-muted px-2 py-1 text-xs">{formatStatus(appeal.status)}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{appeal.appellant.email} · {formatDateTime(appeal.submittedAt)}</p>
          <p className="mt-3 text-sm"><strong>Sanction:</strong> {appeal.sanction.reason}</p>
          <p className="mt-2 text-sm"><strong>Appeal:</strong> {appeal.reason}</p>
          {appeal.case ? (
            <Button className="mt-3" size="sm" variant="outline" render={<Link href={`/admin/trust/cases/${appeal.case.id}`} />}>
              Open case
            </Button>
          ) : null}
          {["submitted", "under_review"].includes(appeal.status) ? (
            <div className="mt-4 border-t pt-4"><AppealReviewForm appealId={appeal.id} /></div>
          ) : appeal.decision ? <p className="mt-3 text-sm">Decision: {appeal.decision}</p> : null}
        </article>
      ))}
      {!appeals.length ? <p className="text-sm text-muted-foreground">No appeals.</p> : null}
    </div>
  );
}
