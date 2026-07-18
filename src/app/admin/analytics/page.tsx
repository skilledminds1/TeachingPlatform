import {
  BookOpenCheck,
  Building2,
  CalendarCheck,
  CircleDollarSign,
  Users,
} from "lucide-react";

import { AdminPageHeader } from "@/features/admin/components/admin-page-header";
import { StatCard } from "@/features/admin/components/stat-card";
import { formatCurrency } from "@/lib/format";
import {
  getAdminDashboardData,
  getAdminOrganizations,
} from "@/server/admin/dashboard";

export default async function AdminAnalyticsPage() {
  const [{ metrics }, organizations] = await Promise.all([
    getAdminDashboardData(),
    getAdminOrganizations(),
  ]);

  const planCounts = organizations.reduce<Record<string, number>>((counts, organization) => {
    counts[organization.plan.name] = (counts[organization.plan.name] ?? 0) + 1;
    return counts;
  }, {});

  const maxPlanCount = Math.max(1, ...Object.values(planCounts));

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <AdminPageHeader
        title="Analytics"
        description="Platform growth, marketplace supply, and subscription overview"
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Monthly recurring revenue"
          value={formatCurrency(metrics.monthlyRecurringRevenueCents)}
          detail="Active subscriptions only"
          icon={CircleDollarSign}
        />
        <StatCard
          label="Registered users"
          value={metrics.userCount.toLocaleString("en-ZA")}
          detail="Non-deleted accounts"
          icon={Users}
        />
        <StatCard
          label="Approved teachers"
          value={metrics.approvedTeacherCount.toLocaleString("en-ZA")}
          detail={`${metrics.teacherCount} total profiles`}
          icon={BookOpenCheck}
        />
        <StatCard
          label="Bookings"
          value={metrics.bookingCount.toLocaleString("en-ZA")}
          detail="All-time marketplace bookings"
          icon={CalendarCheck}
        />
      </section>

      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="size-4" aria-hidden />
          </div>
          <div>
            <h2 className="font-semibold">Organizations by plan</h2>
            <p className="text-xs text-muted-foreground">
              Current plan distribution across active organizations
            </p>
          </div>
        </div>

        {Object.keys(planCounts).length === 0 ? (
          <p className="text-sm text-muted-foreground">No organization data yet.</p>
        ) : (
          <div className="space-y-5">
            {Object.entries(planCounts).map(([plan, count]) => (
              <div key={plan} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{plan}</span>
                  <span className="text-muted-foreground">{count}</span>
                </div>
                <progress
                  value={count}
                  max={maxPlanCount}
                  aria-label={`${plan}: ${count} organizations`}
                  className="h-2 w-full overflow-hidden rounded-full accent-primary"
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
