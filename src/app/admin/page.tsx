import {
  ArrowRight,
  BookOpenCheck,
  Building2,
  CalendarCheck,
  CircleDollarSign,
  Clock3,
  Star,
  Users,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { AdminPageHeader } from "@/features/admin/components/admin-page-header";
import { EmptyState } from "@/features/admin/components/empty-state";
import { StatCard } from "@/features/admin/components/stat-card";
import { StatusBadge, statusTone } from "@/features/admin/components/status-badge";
import { formatCurrency, formatDate, formatDateTime, formatStatus, formatNumber } from "@/lib/format";
import { requirePlatformAdmin } from "@/server/auth/session";
import { getAdminDashboardData } from "@/server/admin/dashboard";

export default async function AdminDashboardPage() {
  const admin = await requirePlatformAdmin();
  const { metrics, recentUsers, recentAuditLogs } = await getAdminDashboardData();

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <AdminPageHeader
        title="Platform overview"
        description={`Marketplace health and moderation status · ${formatDate(new Date())}`}
      />

      <section aria-label="Platform metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total users"
          value={formatNumber(metrics.userCount)}
          detail="Active platform accounts"
          icon={Users}
        />
        <StatCard
          label="Teacher profiles"
          value={formatNumber(metrics.teacherCount)}
          detail={`${metrics.approvedTeacherCount} approved`}
          icon={BookOpenCheck}
        />
        <StatCard
          label="Organizations"
          value={formatNumber(metrics.organizationCount)}
          detail="Solo practices and academies"
          icon={Building2}
        />
        <StatCard
          label="Platform MRR"
          value={formatCurrency(metrics.monthlyRecurringRevenueCents)}
          detail="Active PayFast subscriptions"
          icon={CircleDollarSign}
        />
      </section>

      <section className="grid gap-4 md:grid-cols-3" aria-label="Action required">
        <Link
          href="/admin/teachers"
          className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Teacher approvals</p>
              <p className="font-heading text-2xl font-semibold">{metrics.pendingTeacherCount}</p>
            </div>
            <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/10">
              <Clock3 className="size-4.5 text-amber-500" aria-hidden />
            </div>
          </div>
          <p className="mt-4 flex items-center gap-1 text-sm font-medium text-primary">
            Review queue
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </p>
        </Link>
        <Link
          href="/admin/reviews"
          className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Pending reviews</p>
              <p className="font-heading text-2xl font-semibold">{metrics.pendingReviewCount}</p>
            </div>
            <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/10">
              <Star className="size-4.5 text-amber-500" aria-hidden />
            </div>
          </div>
          <p className="mt-4 flex items-center gap-1 text-sm font-medium text-primary">
            Moderate reviews
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </p>
        </Link>
        <Link
          href="/admin/analytics"
          className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">All bookings</p>
              <p className="font-heading text-2xl font-semibold">{metrics.bookingCount}</p>
            </div>
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
              <CalendarCheck className="size-4.5 text-primary" aria-hidden />
            </div>
          </div>
          <p className="mt-4 flex items-center gap-1 text-sm font-medium text-primary">
            View analytics
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </p>
        </Link>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
            <div>
              <h2 className="font-heading font-semibold">Recent users</h2>
              <p className="text-xs text-muted-foreground">Latest account registrations</p>
            </div>
            <Button size="sm" variant="ghost" render={<Link href="/admin/users" />}>
              View all
            </Button>
          </div>
          {recentUsers.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No users yet"
              description="New account registrations will appear here."
            />
          ) : (
            <ul className="divide-y divide-border">
              {recentUsers.map((user) => {
                const role = user.isPlatformAdmin
                  ? "platform admin"
                  : user.teacherProfile
                    ? "teacher"
                    : user.memberships[0]?.role ?? "student";

                return (
                  <li key={user.id} className="flex items-center justify-between gap-4 px-5 py-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{user.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    </div>
                    <div className="shrink-0 text-end">
                      <StatusBadge tone={role === "platform admin" ? "info" : "neutral"}>
                        {role}
                      </StatusBadge>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(user.createdAt)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
            <div>
              <h2 className="font-heading font-semibold">Admin activity</h2>
              <p className="text-xs text-muted-foreground">Latest moderation actions</p>
            </div>
            <Button size="sm" variant="ghost" render={<Link href="/admin/audit-log" />}>
              View log
            </Button>
          </div>
          {recentAuditLogs.length === 0 ? (
            <EmptyState
              icon={Clock3}
              title="No admin activity"
              description="Approval and moderation actions will be recorded here."
            />
          ) : (
            <ul className="divide-y divide-border">
              {recentAuditLogs.map((log) => {
                const status = log.action.split(".").at(-1) ?? log.action;
                return (
                  <li key={log.id} className="flex items-center justify-between gap-4 px-5 py-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {formatStatus(log.action)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {log.admin.name} · {log.targetType}
                      </p>
                    </div>
                    <div className="shrink-0 text-end">
                      <StatusBadge tone={statusTone(status)}>{status}</StatusBadge>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(log.createdAt, admin.timezone)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
