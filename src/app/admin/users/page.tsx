import { Users } from "lucide-react";

import { AdminPageHeader } from "@/features/admin/components/admin-page-header";
import { EmptyState } from "@/features/admin/components/empty-state";
import { StatusBadge, statusTone } from "@/features/admin/components/status-badge";
import { formatDate, formatStatus } from "@/lib/format";
import { getAdminUsers } from "@/server/admin/dashboard";

export default async function AdminUsersPage() {
  const users = await getAdminUsers();

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <AdminPageHeader
        title="Users"
        description={`${users.length} active platform account${users.length === 1 ? "" : "s"}`}
      />

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {users.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No users"
            description="Registered users will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">User</th>
                  <th className="px-5 py-3 font-medium">Access</th>
                  <th className="px-5 py-3 font-medium">Organization</th>
                  <th className="px-5 py-3 font-medium">Teacher status</th>
                  <th className="px-5 py-3 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((user) => {
                  const access = user.isPlatformAdmin
                    ? "platform admin"
                    : user.teacherProfile
                      ? "teacher"
                      : user.memberships[0]?.role ?? "student";

                  return (
                    <tr key={user.id}>
                      <td className="px-5 py-4">
                        <p className="font-medium">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge tone={user.isPlatformAdmin ? "info" : "neutral"}>
                          {formatStatus(access)}
                        </StatusBadge>
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">
                        {user.memberships[0]?.organization.name ?? "—"}
                      </td>
                      <td className="px-5 py-4">
                        {user.teacherProfile ? (
                          <StatusBadge tone={statusTone(user.teacherProfile.status)}>
                            {formatStatus(user.teacherProfile.status)}
                          </StatusBadge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-muted-foreground">
                        {formatDate(user.createdAt)}
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
