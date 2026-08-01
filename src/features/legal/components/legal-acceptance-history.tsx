import Link from "next/link";

import { StatusBadge } from "@/features/admin/components/status-badge";
import { formatDateTime, formatStatus } from "@/lib/format";

export function LegalAcceptanceHistory({
  acceptances,
  viewerTimeZone,
}: {
  /** INT-03: the viewer's IANA zone. */
  viewerTimeZone: string;
  acceptances: Array<{
    id: string;
    acceptedAt: Date;
    acceptedRole: string;
    method: string;
    document: {
      title: string;
      version: string;
      path: string;
    };
  }>;
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div>
        <h2 className="font-heading text-xl font-semibold tracking-tight">Agreements</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Versions accepted for this account. Optional communication preferences are separate.
        </p>
      </div>
      <div className="divide-y divide-border rounded-xl border border-border">
        {acceptances.map((acceptance) => (
          <div
            key={acceptance.id}
            className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <Link
                href={acceptance.document.path}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {acceptance.document.title}
              </Link>
              <p className="mt-1 text-xs text-muted-foreground">
                Version {acceptance.document.version} · Accepted{" "}
                {formatDateTime(acceptance.acceptedAt, viewerTimeZone)}
              </p>
            </div>
            <div className="flex gap-2">
              <StatusBadge tone="success">{acceptance.acceptedRole}</StatusBadge>
              <StatusBadge>{formatStatus(acceptance.method)}</StatusBadge>
            </div>
          </div>
        ))}
        {acceptances.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No recorded agreements. You will be asked to review the current versions.
          </p>
        ) : null}
      </div>
    </section>
  );
}
