import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { BillingPlanSelector } from "@/features/billing/components/billing-plan-selector";
import { formatDate, formatStatus } from "@/lib/format";
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
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-6">
          <Button variant="ghost" render={<Link href="/dashboard/teacher" />}>
            <ArrowLeft className="size-4" aria-hidden />
            Teacher dashboard
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-6 py-10">
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
        />
      </main>
    </div>
  );
}
