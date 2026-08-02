import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { StudentNavWithNotifications } from "@/features/student-dashboard/components/student-nav-with-notifications";
import { TeacherNavWithNotifications } from "@/features/teacher-dashboard/components/teacher-nav-with-notifications";
import { PrivacyRequestForm } from "@/features/trust/components/trust-forms";
import { formatDateTime, formatStatus } from "@/lib/format";
import { db } from "@/lib/db";
import {
  hasTeacherMembership,
  isAccountHardRestricted,
  requireAuthenticatedIdentity,
} from "@/server/auth/session";

export const metadata: Metadata = { title: "Privacy rights" };

export default async function PrivacyPage() {
  const user = await requireAuthenticatedIdentity();
  const requests = await db.privacyRequest.findMany({
    where: { requesterId: user.id },
    orderBy: { submittedAt: "desc" },
  });
  const isHardRestricted = isAccountHardRestricted(user);
  return (
    <div className="min-h-screen bg-muted/30">
      {isHardRestricted ? (
        <header className="border-b bg-background px-6 py-4">
          <Button render={<Link href="/account-restricted" />} variant="outline">Back to account status</Button>
        </header>
      ) : hasTeacherMembership(user) ? <TeacherNavWithNotifications /> : <StudentNavWithNotifications />}
      <main id="main-content" className="mx-auto max-w-4xl space-y-8 px-6 py-10">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">Privacy rights</h1>
          <p className="mt-1 text-muted-foreground">
            Request access, deletion, correction, or objection regarding your personal information.
          </p>
        </header>
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">New request</h2>
          <PrivacyRequestForm />
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Request history</h2>
          {requests.map((request) => (
            <article key={request.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{formatStatus(request.type)}</p>
                <span className="rounded-full bg-muted px-2 py-1 text-xs">{formatStatus(request.status)}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Submitted {formatDateTime(request.submittedAt, user.timezone)}
              </p>
              {request.response ? <p className="mt-3 text-sm">{request.response}</p> : null}
            </article>
          ))}
          {!requests.length ? <p className="text-sm text-muted-foreground">No requests submitted.</p> : null}
        </section>
      </main>
    </div>
  );
}
