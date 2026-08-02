"use client";

import { useMemo, useState } from "react";
import { CreditCard } from "lucide-react";

import { ComplimentaryGrantDialog } from "@/features/admin/components/complimentary-grant-dialog";
import { EmptyState } from "@/features/admin/components/empty-state";
import { StatusBadge, statusTone } from "@/features/admin/components/status-badge";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate, formatDateTime, formatStatus } from "@/lib/format";

type PlanOption = {
  id: string;
  name: string;
  slug: string;
};

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  subscriptionStatus: string;
  billingInterval: "monthly" | "annual";
  currentPeriodEnd: string | Date | null;
  complimentaryExpiresAt: string | Date | null;
  complimentaryNote: string | null;
  hasPayfast: boolean;
  isComplimentary: boolean;
  adminContact: { id: string; name: string; email: string } | null;
  plan: {
    id: string;
    name: string;
    slug: string;
    monthlyPriceCents: number;
    annualPriceCents: number;
    currency: string;
  };
  complimentaryPlan: { id: string; name: string; slug: string } | null;
  _count: { members: number; teacherProfiles: number };
};

export function SubscriptionOrganizationsTable({
  organizations,
  plans,
  viewerTimeZone,
}: {
  organizations: OrganizationRow[];
  plans: PlanOption[];
  /** INT-03: the viewer's IANA zone — client components cannot read the session. */
  viewerTimeZone: string;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return organizations;
    return organizations.filter((organization) => {
      const haystack = [
        organization.name,
        organization.slug,
        organization.plan.name,
        organization.adminContact?.name,
        organization.adminContact?.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [organizations, query]);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold">Teacher subscriptions</h2>
          <p className="text-sm text-muted-foreground">
            Upgrade organizations for free or revoke complimentary access.
          </p>
        </div>
        <Input
          className="max-w-sm"
          placeholder="Search organizations, teachers, plans…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {filtered.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="No organizations found"
            description="Try a different search, or wait for teachers to register."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Organization</th>
                  <th className="px-5 py-3 font-medium">Plan</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Billing</th>
                  <th className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((organization) => (
                  <tr key={organization.id}>
                    <td className="px-5 py-4 align-top">
                      <p className="font-medium">{organization.name}</p>
                      <p className="text-xs text-muted-foreground">{organization.slug}</p>
                      {organization.adminContact ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {organization.adminContact.name} · {organization.adminContact.email}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 align-top">
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
                      {organization.isComplimentary ? (
                        <div className="mt-2 space-y-1">
                          <StatusBadge tone="info">Complimentary</StatusBadge>
                          <p className="text-xs text-muted-foreground">
                            {organization.complimentaryExpiresAt
                              ? `Expires ${formatDateTime(organization.complimentaryExpiresAt, viewerTimeZone)}`
                              : "Permanent"}
                          </p>
                          {organization.complimentaryNote ? (
                            <p className="text-xs text-muted-foreground">
                              {organization.complimentaryNote}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 align-top">
                      <StatusBadge tone={statusTone(organization.subscriptionStatus)}>
                        {formatStatus(organization.subscriptionStatus)}
                      </StatusBadge>
                    </td>
                    <td className="px-5 py-4 align-top text-xs text-muted-foreground">
                      <p>{organization.hasPayfast ? "PayFast linked" : "No PayFast token"}</p>
                      {organization.currentPeriodEnd ? (
                        <p className="mt-1">
                          Period ends {formatDate(new Date(organization.currentPeriodEnd))}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 align-top">
                      <ComplimentaryGrantDialog
                        organizationId={organization.id}
                        organizationName={organization.name}
                        plans={plans}
                        isComplimentary={organization.isComplimentary}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
