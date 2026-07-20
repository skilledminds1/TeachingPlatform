import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { StudentNavWithNotifications } from "@/features/student-dashboard/components/student-nav-with-notifications";
import { TeacherNavWithNotifications } from "@/features/teacher-dashboard/components/teacher-nav-with-notifications";
import { formatDateTime, formatStatus } from "@/lib/format";
import { db } from "@/lib/db";
import {
  hasTeacherMembership,
  isAccountHardRestricted,
  requireAuthenticatedIdentity,
} from "@/server/auth/session";

export const metadata: Metadata = { title: "Trust cases" };

export default async function CasesPage() {
  const user = await requireAuthenticatedIdentity();
  const cases = await db.moderationCase.findMany({
    where: {
      OR: [
        { reporterId: user.id },
        { subjectId: user.id },
        { refundRequest: { is: { studentId: user.id } } },
        { refundRequest: { is: { teacherId: user.id } } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    include: { assignedAdmin: { select: { name: true } } },
  });
  const isHardRestricted = isAccountHardRestricted(user);
  return (
    <div className="min-h-screen bg-muted/30">
      {isHardRestricted ? (
        <header className="border-b bg-background px-6 py-4">
          <Button render={<Link href="/account-restricted" />} variant="outline">Back to account status</Button>
        </header>
      ) : hasTeacherMembership(user) ? <TeacherNavWithNotifications /> : <StudentNavWithNotifications />}
      <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">Cases</h1>
          <p className="mt-1 text-muted-foreground">Shared mediation and trust reviews involving your account.</p>
        </header>
        {cases.map((item) => (
          <article key={item.id} className="flex items-center justify-between gap-4 rounded-xl border bg-card p-5 shadow-sm">
            <div>
              <p className="font-medium">{item.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatStatus(item.status)} · Updated {formatDateTime(item.updatedAt, user.timezone)}
                {item.assignedAdmin ? ` · Assigned to ${item.assignedAdmin.name}` : ""}
              </p>
            </div>
            <Button render={<Link href={`/dashboard/cases/${item.id}`} />} variant="outline">Open</Button>
          </article>
        ))}
        {!cases.length ? <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No cases.</p> : null}
      </main>
    </div>
  );
}
