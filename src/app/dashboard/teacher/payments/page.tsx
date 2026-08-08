import { PaymentLinkEditor } from "@/features/payments/components/payment-link-editor";
import { paymentLinkProvidersForCountry } from "@/lib/payments/payment-links";
import { db } from "@/lib/db";
import { requireTeacher } from "@/server/auth/session";
import { getTeacherEarningsSummary } from "@/server/teachers/earnings";

export default async function TeacherPaymentsPage() {
  const teacher = await requireTeacher();
  const [earnings, profile] = await Promise.all([
    getTeacherEarningsSummary(),
    db.teacherProfile.findUnique({
      where: { userId: teacher.id },
      select: {
        paymentLinkUrl: true,
        paymentLinkHost: true,
        pendingPaymentLinkHost: true,
      },
    }),
  ]);

  return (
    <div className="min-h-screen bg-muted/20">
      <main id="main-content" className="mx-auto max-w-4xl space-y-8 px-6 py-10">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Student payments</h1>
          <p className="mt-2 text-muted-foreground">
            Students pay you directly. Save a link from your own payment provider and we send
            them straight to it.
          </p>
        </div>


        <PaymentLinkEditor
          currentUrl={profile?.paymentLinkUrl ?? null}
          currentHost={profile?.paymentLinkHost ?? null}
          pendingHost={profile?.pendingPaymentLinkHost ?? null}
          providers={paymentLinkProvidersForCountry(teacher.country)}
        />


        <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
          <div>
            <h2 className="font-semibold">Payments you have marked as received</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your own record, not accounting. Amazing Skills never receives these payments, so
              it cannot see or reconcile them — the authoritative figures are in your payment
              provider.
            </p>
          </div>
          {earnings.totals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing recorded yet. Mark a payment received from the lesson page once it
              arrives.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {earnings.totals.map((total) => (
                <li key={total.currency} className="rounded-lg border border-border p-3 text-sm">
                  <p className="font-medium">{total.currency}</p>
                  <p className="mt-1 text-muted-foreground">
                    {total.grossLabel} across {total.count} lesson
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
