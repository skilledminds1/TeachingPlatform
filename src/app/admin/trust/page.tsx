import { Scale, ShieldAlert } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { AdminPageHeader } from "@/features/admin/components/admin-page-header";
import { StatusBadge, statusTone } from "@/features/admin/components/status-badge";
import { SafetyReportReviewForm } from "@/features/trust/components/trust-forms";
import { formatDateTime, formatStatus } from "@/lib/format";
import { db } from "@/lib/db";

export default async function AdminTrustPage() {
  const [cases, reports, appealCount, privacyCount] = await Promise.all([
    db.moderationCase.findMany({
      where: { status: { in: ["open", "under_review", "awaiting_response"] } },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      include: {
        reporter: { select: { name: true } },
        subject: { select: { name: true } },
        assignedAdmin: { select: { name: true } },
      },
    }),
    db.safetyReport.findMany({
      where: { status: { in: ["submitted", "triaged", "investigating"] } },
      orderBy: { createdAt: "asc" },
      include: {
        reporter: { select: { name: true, email: true } },
        subject: { select: { name: true } },
      },
      take: 20,
    }),
    db.appeal.count({ where: { status: { in: ["submitted", "under_review"] } } }),
    db.privacyRequest.count({ where: { status: { in: ["submitted", "verifying", "in_progress"] } } }),
  ]);
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <AdminPageHeader
        title="Trust & Safety"
        description="Review safety concerns, mediate cases, apply appealable account actions, and manage privacy rights. Trust controls cannot move or refund teacher funds."
      />
      <div className="flex flex-wrap gap-3">
        <Button render={<Link href="/admin/trust/appeals" />} variant="outline">
          Appeals ({appealCount})
        </Button>
        <Button render={<Link href="/admin/trust/privacy" />} variant="outline">
          Privacy requests ({privacyCount})
        </Button>
      </div>
      <section className="space-y-3">
        <div className="flex items-center gap-2"><Scale className="size-5" /><h2 className="text-xl font-semibold">Open cases</h2></div>
        {cases.map((item) => (
          <article key={item.id} className="flex flex-col justify-between gap-4 rounded-xl border bg-card p-5 shadow-sm sm:flex-row sm:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{item.title}</p>
                <StatusBadge tone={statusTone(item.status)}>{formatStatus(item.status)}</StatusBadge>
                <StatusBadge tone={item.priority === "urgent" ? "danger" : item.priority === "high" ? "warning" : "neutral"}>
                  {formatStatus(item.priority)}
                </StatusBadge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Reporter: {item.reporter?.name ?? "Unknown"} · Subject: {item.subject?.name ?? "None"} ·{" "}
                {item.assignedAdmin ? `Assigned to ${item.assignedAdmin.name}` : "Unassigned"}
              </p>
            </div>
            <Button render={<Link href={`/admin/trust/cases/${item.id}`} />}>Review</Button>
          </article>
        ))}
        {!cases.length ? <p className="text-sm text-muted-foreground">No open cases.</p> : null}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2"><ShieldAlert className="size-5" /><h2 className="text-xl font-semibold">Safety report queue</h2></div>
        {reports.map((report) => (
          <article key={report.id} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{formatStatus(report.category)}</p>
              <StatusBadge tone={statusTone(report.status)}>{formatStatus(report.status)}</StatusBadge>
            </div>
            <p className="mt-2 text-sm">{report.description}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {report.reporter.name} ({report.reporter.email})
              {report.subject ? ` reported ${report.subject.name}` : ""} · {formatDateTime(report.createdAt)}
            </p>
            <SafetyReportReviewForm reportId={report.id} />
          </article>
        ))}
        {!reports.length ? <p className="text-sm text-muted-foreground">No pending safety reports.</p> : null}
      </section>
    </div>
  );
}
