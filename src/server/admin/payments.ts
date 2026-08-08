import { db } from "@/lib/db";
import { recordAdminAccess } from "@/server/admin/audit";
import { requirePlatformAdmin } from "@/server/auth/session";

export async function getAdminPaymentOperations() {
  const admin = await requirePlatformAdmin();

  // SEC-13: this reads every refund request, dispute, payment attempt and subscription
  // invoice on the platform, including student and teacher identities. Reads of private
  // data are auditable per PROJECT.md, and previously only writes were logged.
  await recordAdminAccess({
    adminUserId: admin.id,
    action: "payments.viewed",
    targetType: "platform",
    targetId: admin.id,
  });

  const [refundRequests, recentPayments, subscriptionInvoices] = await Promise.all([
    db.refundRequest.findMany({
      orderBy: { requestedAt: "desc" },
      take: 100,
      include: {
        student: { select: { id: true, name: true, email: true } },
        teacher: { select: { id: true, name: true, email: true } },
      },
    }),
    db.booking.findMany({
      where: { paymentReportedAt: { not: null } },
      orderBy: { paymentReportedAt: "desc" },
      take: 100,
      select: {
        id: true,
        hourlyRateCents: true,
        currency: true,
        paymentReportedAt: true,
        paymentReference: true,
        startsAt: true,
        student: { select: { name: true, email: true } },
        teacher: { select: { name: true, email: true } },
      },
    }),
    db.subscriptionInvoice.findMany({
      orderBy: { issuedAt: "desc" },
      take: 100,
      include: {
        organization: { select: { name: true, slug: true } },
      },
    }),
  ]);

  return { refundRequests, recentPayments, subscriptionInvoices };
}
