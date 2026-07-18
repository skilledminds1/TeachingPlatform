import { ScrollText } from "lucide-react";

import { AdminPageHeader } from "@/features/admin/components/admin-page-header";
import { EmptyState } from "@/features/admin/components/empty-state";
import { StatusBadge, statusTone } from "@/features/admin/components/status-badge";
import { formatDateTime, formatStatus } from "@/lib/format";
import { getAdminAuditLogs } from "@/server/admin/dashboard";

export default async function AdminAuditLogPage() {
  const logs = await getAdminAuditLogs();

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <AdminPageHeader
        title="Audit log"
        description="Immutable history of platform-admin moderation actions"
      />

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {logs.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No admin activity"
            description="Teacher approvals and review moderation decisions will be recorded here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Action</th>
                  <th className="px-5 py-3 font-medium">Administrator</th>
                  <th className="px-5 py-3 font-medium">Target</th>
                  <th className="px-5 py-3 font-medium">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((log) => {
                  const result = log.action.split(".").at(-1) ?? log.action;

                  return (
                    <tr key={log.id}>
                      <td className="px-5 py-4">
                        <StatusBadge tone={statusTone(result)}>
                          {formatStatus(log.action)}
                        </StatusBadge>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-medium">{log.admin.name}</p>
                        <p className="text-xs text-muted-foreground">{log.admin.email}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-medium">{log.targetType}</p>
                        <p className="font-mono text-xs text-muted-foreground">{log.targetId}</p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-muted-foreground">
                        {formatDateTime(log.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
