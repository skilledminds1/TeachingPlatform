import { AlertCircle, ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PaymentProviderCard } from "@/features/payments/components/payment-provider-card";
import { getTeacherEarningsSummary } from "@/server/teachers/earnings";
import { getTeacherPaymentSettings } from "@/server/teachers/payments";

export default async function TeacherPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const [data, earnings, query] = await Promise.all([
    getTeacherPaymentSettings(),
    getTeacherEarningsSummary(),
    searchParams,
  ]);
  const paypal = data.accounts.find((account) => account.provider === "paypal");

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-4xl items-center px-6">
          <Button variant="ghost" render={<Link href="/dashboard/teacher" />}>
            <ArrowLeft className="size-4" aria-hidden />
            Teacher dashboard
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-6 py-10">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Student payments</h1>
          <p className="mt-2 text-muted-foreground">
            Connect PayPal so students can pay you directly for lessons — Amazing Skills takes no
            commission. Teacher platform subscriptions are billed separately via PayFast.
          </p>
        </div>

        {query.connected ? (
          <div className="flex gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            PayPal connected successfully.
          </div>
        ) : null}
        {query.error ? (
          <div className="flex gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            The provider could not be connected. Please try again.
          </div>
        ) : null}

        <div className="max-w-md">
          <PaymentProviderCard
            configured={data.configured.paypal}
            connected={Boolean(paypal?.isActive && paypal.onboardingStatus === "complete")}
            maskedAccountId={paypal?.maskedAccountId}
            onboardingStatus={paypal?.onboardingStatus}
            settlementCurrency={paypal?.settlementCurrency}
            country={paypal?.country}
          />
        </div>

        {!data.lessonFlags.paypal ? (
          <p className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
            Lesson payments are currently off. An administrator must complete PayPal partner
            approval and set `LESSON_PAYMENTS_PAYPAL_ENABLED=true` before students can checkout.
          </p>
        ) : null}

        <p className="text-sm text-muted-foreground">
          Students pay you via PayPal in your chosen lesson currency. Provider processing fees still
          apply.
        </p>

        <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
          <div>
            <h2 className="font-semibold">Earnings summary</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Read-only totals from verified lesson payments on Amazing Skills (provider fees may
              already be deducted at the provider).
            </p>
          </div>
          {earnings.totals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No lesson payments recorded yet.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {earnings.totals.map((total) => (
                <li key={total.currency} className="rounded-lg border border-border p-3 text-sm">
                  <p className="font-medium">{total.currency}</p>
                  <p className="mt-1 text-muted-foreground">
                    Net {total.netLabel} from {total.count} payment
                    {total.count === 1 ? "" : "s"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
