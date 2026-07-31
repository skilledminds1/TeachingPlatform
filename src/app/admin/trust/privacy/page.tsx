import Link from "next/link";

import { Button } from "@/components/ui/button";
import { AdminPageHeader } from "@/features/admin/components/admin-page-header";
import { PrivacyAdminForm } from "@/features/trust/components/trust-forms";
import { formatDateTime, formatStatus } from "@/lib/format";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/server/auth/session";

export default async function AdminPrivacyRequestsPage() {
  await requirePlatformAdmin();
  const requests = await db.privacyRequest.findMany({
    orderBy: { submittedAt: "desc" },
    include: {
      requester: { select: { name: true, email: true } },
      assignedAdmin: { select: { name: true } },
    },
  });
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <AdminPageHeader
        title="Privacy requests"
        description="Manage access, deletion, correction, and objection requests while retaining payment, legal, audit, and safety records where required."
      />
      <Button render={<Link href="/admin/trust" />} variant="outline">Back to Trust & Safety</Button>
      {requests.map((request) => (
        <article key={request.id} className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{request.requester.name} · {formatStatus(request.type)}</p>
            <span className="rounded-full bg-muted px-2 py-1 text-xs">{formatStatus(request.status)}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {request.requester.email} · {formatDateTime(request.submittedAt)}
            {request.assignedAdmin ? ` · ${request.assignedAdmin.name}` : ""}
          </p>
          {request.details ? <p className="mt-3 text-sm">{request.details}</p> : null}
          {!["completed", "denied", "cancelled"].includes(request.status) ? (
            <div className="mt-4 border-t pt-4"><PrivacyAdminForm requestId={request.id} /></div>
          ) : request.response ? <p className="mt-3 text-sm">Response: {request.response}</p> : null}
        </article>
      ))}
      {!requests.length ? <p className="text-sm text-muted-foreground">No privacy requests.</p> : null}
    </div>
  );
}
