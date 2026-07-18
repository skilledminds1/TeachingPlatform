import { Building2 } from "lucide-react";

import { AdminPageHeader } from "@/features/admin/components/admin-page-header";
import { EmptyState } from "@/features/admin/components/empty-state";
import { StatusBadge, statusTone } from "@/features/admin/components/status-badge";
import { formatCurrency, formatDate, formatStatus } from "@/lib/format";
import { getAdminOrganizations } from "@/server/admin/dashboard";

export default async function AdminOrganizationsPage() {
  const organizations = await getAdminOrganizations();

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <AdminPageHeader
        title="Organizations"
        description={`${organizations.length} active organization${organizations.length === 1 ? "" : "s"}`}
      />

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {organizations.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No organizations"
            description="Organizations are created when teachers or academies register."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Organization</th>
                  <th className="px-5 py-3 font-medium">Plan</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Members</th>
                  <th className="px-5 py-3 font-medium">Teachers</th>
                  <th className="px-5 py-3 font-medium">Bookings</th>
                  <th className="px-5 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {organizations.map((organization) => (
                  <tr key={organization.id}>
                    <td className="px-5 py-4">
                      <p className="font-medium">{organization.name}</p>
                      <p className="text-xs text-muted-foreground">{organization.slug}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium">{organization.plan.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(
                          organization.billingInterval === "annual"
                            ? organization.plan.annualPriceCents
                            : organization.plan.monthlyPriceCents,
                          organization.plan.currency,
                        )}
                        /{organization.billingInterval === "annual" ? "year" : "month"}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge tone={statusTone(organization.subscriptionStatus)}>
                        {formatStatus(organization.subscriptionStatus)}
                      </StatusBadge>
                    </td>
                    <td className="px-5 py-4">{organization._count.members}</td>
                    <td className="px-5 py-4">{organization._count.teacherProfiles}</td>
                    <td className="px-5 py-4">{organization._count.bookings}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-muted-foreground">
                      {formatDate(organization.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
