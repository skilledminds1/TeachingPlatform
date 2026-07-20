import { ShieldAlert } from "lucide-react";
import type { Metadata } from "next";

import { StudentNavWithNotifications } from "@/features/student-dashboard/components/student-nav-with-notifications";
import { TeacherNavWithNotifications } from "@/features/teacher-dashboard/components/teacher-nav-with-notifications";
import { BlockUserButton, SafetyReportForm } from "@/features/trust/components/trust-forms";
import { formatDateTime, formatStatus } from "@/lib/format";
import { db } from "@/lib/db";
import { hasTeacherMembership, requireAuth } from "@/server/auth/session";

export const metadata: Metadata = { title: "Safety center" };

export default async function SafetyPage() {
  const user = await requireAuth();
  const [reports, blocks] = await Promise.all([
    db.safetyReport.findMany({
      where: { reporterId: user.id },
      orderBy: { createdAt: "desc" },
      include: { subject: { select: { name: true } } },
    }),
    db.userBlock.findMany({
      where: { blockerId: user.id },
      orderBy: { createdAt: "desc" },
      include: { blocked: { select: { id: true, name: true } } },
    }),
  ]);

  return (
    <div className="min-h-screen bg-muted/30">
      {hasTeacherMembership(user) ? <TeacherNavWithNotifications /> : <StudentNavWithNotifications />}
      <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        <header className="flex items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldAlert className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Safety center</h1>
            <p className="mt-1 text-muted-foreground">
              Report a concern and manage people you have blocked. Call local emergency services for immediate danger.
            </p>
          </div>
        </header>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Report a safety concern</h2>
            <p className="mb-4 mt-1 text-sm text-muted-foreground">
              Do not paste private conversations unrelated to the report. Case staff only receive evidence you deliberately submit.
            </p>
            <SafetyReportForm />
          </div>
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Blocked users</h2>
            <p className="mb-4 mt-1 text-sm text-muted-foreground">
              Blocking prevents new direct conversations and new bookings. Existing paid course and lesson access remains available.
            </p>
            <div className="space-y-3">
              {blocks.map((block) => (
                <div key={block.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <span className="text-sm font-medium">{block.blocked.name}</span>
                  <BlockUserButton userId={block.blocked.id} blocked />
                </div>
              ))}
              {!blocks.length ? <p className="text-sm text-muted-foreground">You have not blocked anyone.</p> : null}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Your reports</h2>
          {reports.map((report) => (
            <article key={report.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{formatStatus(report.category)}</p>
                <span className="rounded-full bg-muted px-2 py-1 text-xs">{formatStatus(report.status)}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{report.description}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {report.subject ? `Reported user: ${report.subject.name} · ` : ""}
                {formatDateTime(report.createdAt, user.timezone)}
              </p>
              {report.resolution ? <p className="mt-3 text-sm">Resolution: {report.resolution}</p> : null}
            </article>
          ))}
          {!reports.length ? <p className="text-sm text-muted-foreground">No reports submitted.</p> : null}
        </section>
      </main>
    </div>
  );
}
