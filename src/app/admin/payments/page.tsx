import { CircleDollarSign, FileText, Handshake } from "lucide-react";

import { AdminPageHeader } from "@/features/admin/components/admin-page-header";
import { StatusBadge, statusTone } from "@/features/admin/components/status-badge";
import { formatCurrency, formatDateTime, formatStatus } from "@/lib/format";
import { requirePlatformAdmin } from "@/server/auth/session";
import { getAdminPaymentOperations } from "@/server/admin/payments";

export default async function AdminPaymentsPage() {
  const admin = await requirePlatformAdmin();
  const data = await getAdminPaymentOperations();

  return (
    <div className="mx-auto max-w-7xl space-y-10">
      <AdminPageHeader
        title="Payment oversight"
        description="Monitor teacher-processed transactions, refund requests, provider disputes, and Amazing Skills subscription invoices. Admins cannot move or refund teacher funds."
      />

      <section className="space-y-4">
        <SectionHeading
          icon={Handshake}
          title="Refund requests"
          description="Teachers are responsible for issuing refunds directly to students."
        />
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full min-w-[900px] text-start text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Request</th>
                <th className="px-4 py-3 font-medium">Student</th>
                <th className="px-4 py-3 font-medium">Teacher</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Policy</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Requested</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.refundRequests.map((request) => (
                <tr key={request.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">Live lesson</p>
                    <p className="max-w-xs truncate text-xs text-muted-foreground">
                      {request.reason}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p>{request.student.name}</p>
                    <p className="text-xs text-muted-foreground">{request.student.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p>{request.teacher.name}</p>
                    <p className="text-xs text-muted-foreground">{request.teacher.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    {formatCurrency(request.requestedAmountCents, request.currency)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={request.policyEligible ? "success" : "warning"}>
                      {request.policyEligible ? "Eligible" : "Teacher discretion"}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={statusTone(request.status)}>
                      {formatStatus(request.status)}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDateTime(request.requestedAt, admin.timezone)}
                  </td>
                </tr>
              ))}
              {data.refundRequests.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-muted-foreground" colSpan={7}>
                    No refund requests.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading
          icon={CircleDollarSign}
          title="Payments teachers reported"
          description="What teachers said they received. Amazing Skills does not process these payments and cannot verify them — they are reports, not records."
        />
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full min-w-[850px] text-start text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Student</th>
                <th className="px-4 py-3 font-medium">Teacher</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Reference</th>
                <th className="px-4 py-3 font-medium">Reported</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.recentPayments.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-4 py-3">{payment.student.name}</td>
                  <td className="px-4 py-3">{payment.teacher.name}</td>
                  <td className="px-4 py-3">
                    {formatCurrency(payment.hourlyRateCents, payment.currency)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {payment.paymentReference ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {payment.paymentReportedAt
                      ? formatDateTime(payment.paymentReportedAt, admin.timezone)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading
          icon={FileText}
          title="Platform subscription invoices"
          description="Invoices for subscription payments received by Amazing Skills through Paddle."
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.subscriptionInvoices.map((invoice) => (
            <article key={invoice.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{invoice.organization.name}</p>
                  <p className="text-xs text-muted-foreground">{invoice.description}</p>
                </div>
                <StatusBadge tone={statusTone(invoice.status)}>
                  {formatStatus(invoice.status)}
                </StatusBadge>
              </div>
              <p className="mt-4 text-xl font-semibold">
                {formatCurrency(invoice.amountCents, invoice.currency)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Issued {formatDateTime(invoice.issuedAt, admin.timezone)}
              </p>
            </article>
          ))}
          {data.subscriptionInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No subscription invoices yet.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Handshake;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" aria-hidden />
      </span>
      <div>
        <h2 className="font-heading text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
