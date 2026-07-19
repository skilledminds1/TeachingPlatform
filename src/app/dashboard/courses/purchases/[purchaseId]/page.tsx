import { ArrowLeft, BookOpen, CreditCard } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { StatusBadge, statusTone } from "@/features/admin/components/status-badge";
import { formatCurrency, formatStatus } from "@/lib/format";
import { db } from "@/lib/db";
import { requireAuth } from "@/server/auth/session";
import { expireAbandonedPayments } from "@/server/payments/confirm";

export const metadata: Metadata = { title: "Course purchase" };

export default async function CoursePurchasePage({
  params,
  searchParams,
}: {
  params: Promise<{ purchaseId: string }>;
  searchParams: Promise<{ payment?: string }>;
}) {
  const [{ purchaseId }, query, user] = await Promise.all([
    params,
    searchParams,
    requireAuth(),
    expireAbandonedPayments().catch(() => 0),
  ]);
  const purchase = await db.coursePurchase.findFirst({
    where: { id: purchaseId, studentId: user.id },
    select: {
      id: true,
      status: true,
      amountCents: true,
      currency: true,
      course: { select: { id: true, slug: true, title: true } },
    },
  });
  if (!purchase) notFound();

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-2xl items-center px-6">
          <Button variant="ghost" render={<Link href="/courses" />}>
            <ArrowLeft className="size-4" aria-hidden />
            All courses
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-6 px-6 py-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Course purchase</p>
            <h1 className="text-3xl font-semibold tracking-tight">{purchase.course.title}</h1>
          </div>
          <StatusBadge tone={statusTone(purchase.status)}>
            {formatStatus(purchase.status)}
          </StatusBadge>
        </div>

        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <CreditCard className="size-4" aria-hidden />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="font-medium">
                {formatCurrency(purchase.amountCents, purchase.currency)}
              </p>
            </div>
          </div>
        </section>

        {purchase.status === "pending" && query.payment === "return" ? (
          <section className="rounded-xl border border-primary/30 bg-primary/5 p-5 text-sm">
            Payment is being verified. Access is granted automatically after PayPal confirms it.
          </section>
        ) : null}
        {purchase.status === "pending" && query.payment === "cancelled" ? (
          <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm">
            Checkout was cancelled. No course access has been granted.
          </section>
        ) : null}
        {purchase.status === "succeeded" ? (
          <section className="flex items-center justify-between gap-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5">
            <div>
              <p className="font-medium">You are enrolled</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Your course is ready in the student dashboard.
              </p>
            </div>
            <Button render={<Link href={`/dashboard/courses/${purchase.course.id}`} />}>
              <BookOpen className="size-4" aria-hidden />
              Open course
            </Button>
          </section>
        ) : null}
        {purchase.status === "refunded" || purchase.status === "cancelled" ? (
          <section className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
            This purchase is {purchase.status}. Course access is not active.
          </section>
        ) : null}
      </main>
    </div>
  );
}
