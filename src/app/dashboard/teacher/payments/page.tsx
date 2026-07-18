import { AlertCircle, ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PaymentProviderCard } from "@/features/payments/components/payment-provider-card";
import { getTeacherPaymentSettings } from "@/server/teachers/payments";

export default async function TeacherPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const [data, query] = await Promise.all([getTeacherPaymentSettings(), searchParams]);
  const stripe = data.accounts.find((account) => account.provider === "stripe");
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
            Link your own provider. Lesson payments go directly from students to you.
          </p>
        </div>

        {query.connected ? (
          <div className="flex gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            {query.connected === "stripe" ? "Stripe" : "PayPal"} connected successfully.
          </div>
        ) : null}
        {query.error ? (
          <div className="flex gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            The provider could not be connected. Please try again.
          </div>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <PaymentProviderCard
            provider="stripe"
            configured={data.configured.stripe}
            connected={Boolean(stripe)}
            maskedAccountId={stripe?.maskedAccountId}
          />
          <PaymentProviderCard
            provider="paypal"
            configured={data.configured.paypal}
            connected={Boolean(paypal)}
            maskedAccountId={paypal?.maskedAccountId}
          />
        </div>

        {!data.configured.stripe && !data.configured.paypal ? (
          <p className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
            Stripe and PayPal are not configured. Teachers cannot link payout accounts until
            the platform administrator enables provider onboarding.
          </p>
        ) : null}

        <p className="text-sm text-muted-foreground">
          Amazing Skills never stores card details and does not hold or disburse lesson funds.
          Provider processing fees still apply.
        </p>
      </main>
    </div>
  );
}
