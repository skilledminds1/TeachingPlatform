import { redirect } from "next/navigation";

import { BillingPlanSelector } from "@/features/billing/components/billing-plan-selector";
import { StatusBadge, statusTone } from "@/features/admin/components/status-badge";
import { formatCurrency, formatDate, formatStatus } from "@/lib/format";
import { getBillingSettings } from "@/server/billing/settings";

export default async function TeacherBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; plan?: string; interval?: string }>;
}) {
  const [data, query] = await Promise.all([getBillingSettings(), searchParams]);
  if (!data) redirect("/dashboard/teacher");

  const autoCheckoutPlan =
    query.plan === "starter" || query.plan === "professional" || query.plan === "business"
      ? query.plan
      : undefined;
  const autoCheckoutInterval =
    query.interval === "annual" || query.interval === "monthly" ? query.interval : undefined;

  return (
    <div className="min-h-screen bg-muted/20">
      <main id="main-content" className="mx-auto max-w-7xl space-y-8 px-6 py-10">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Plans & billing</h1>
          <p className="mt-2 text-muted-foreground">
            Unlock more tools as your teaching business grows.
          </p>
        </div>

        {query.checkout === "return" ? (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
            Your payment is being confirmed. The plan activates automatically after PayFast sends
            its verified notification.
          </div>
        ) : null}
        {query.checkout === "cancelled" ? (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
            Checkout was cancelled. Your current plan has not changed.
          </div>
        ) : null}

        <section className="grid gap-4 rounded-xl border border-border bg-card p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Current plan</p>
            <p className="mt-1 font-semibold">{data.organization.plan.name}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
            <p className="mt-1 font-semibold">
              {formatStatus(data.organization.subscriptionStatus)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Active students</p>
            <p className="mt-1 font-semibold">
              {data.usage.activeStudents} / {data.usage.limit ?? "Unlimited"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Live lessons this month
            </p>
            <p className="mt-1 font-semibold">
              {(data.liveLessonUsage.usedMinutes / 60).toFixed(1).replace(".0", "")} /{" "}
              {data.liveLessonUsage.limit === null
                ? "Unlimited"
                : data.liveLessonUsage.limit / 60}{" "}
              hours
            </p>
          </div>
          {data.organization.currentPeriodEnd ? (
            <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
              Current period ends {formatDate(data.organization.currentPeriodEnd)}
            </p>
          ) : null}
        </section>

        <BillingPlanSelector
          plans={data.plans}
          currentPlan={data.organization.plan.slug}
          currentInterval={data.organization.billingInterval}
          payfastConfigured={data.payfastConfigured}
          autoCheckoutPlan={autoCheckoutPlan}
          autoCheckoutInterval={autoCheckoutInterval}
          pendingPlan={data.organization.pendingPlan}
          pendingChangeAt={data.organization.pendingChangeAt}
          subscriptionStatus={data.organization.subscriptionStatus}
          currentPeriodEnd={data.organization.currentPeriodEnd}
          cancelAtPeriodEnd={data.organization.cancelAtPeriodEnd}
          graceStartedAt={data.organization.graceStartedAt}
          graceEndsAt={data.organization.graceEndsAt}
        />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Subscription invoices</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              PayFast payments received by Amazing Skills for your platform subscription.
            </p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full min-w-[720px] text-start text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Issued</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Period</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">PayFast reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="px-4 py-3">{formatDate(invoice.issuedAt)}</td>
                    <td className="px-4 py-3 font-medium">{invoice.description}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(invoice.periodStart)} – {formatDate(invoice.periodEnd)}
                    </td>
                    <td className="px-4 py-3">
                      {formatCurrency(invoice.amountCents, invoice.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={statusTone(invoice.status)}>
                        {formatStatus(invoice.status)}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {invoice.providerPaymentId}
                    </td>
                  </tr>
                ))}
                {data.invoices.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-muted-foreground" colSpan={6}>
                      No subscription invoices yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
