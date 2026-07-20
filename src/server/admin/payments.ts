import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/server/auth/session";

export async function getAdminPaymentOperations() {
  await requirePlatformAdmin();

  const [refundRequests, disputes, recentPayments, subscriptionInvoices] = await Promise.all([
    db.refundRequest.findMany({
      orderBy: { requestedAt: "desc" },
      take: 100,
      include: {
        student: { select: { id: true, name: true, email: true } },
        teacher: { select: { id: true, name: true, email: true } },
        booking: { select: { id: true, startsAt: true } },
        coursePurchase: {
          select: {
            id: true,
            course: { select: { title: true } },
          },
        },
      },
    }),
    db.paymentDispute.findMany({
      orderBy: { openedAt: "desc" },
      take: 100,
      include: {
        paymentAttempt: {
          select: {
            amountCents: true,
            currency: true,
            bookingId: true,
            coursePurchaseId: true,
          },
        },
      },
    }),
    db.paymentAttempt.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        provider: true,
        status: true,
        amountCents: true,
        refundedCents: true,
        currency: true,
        providerPaymentId: true,
        createdAt: true,
        booking: {
          select: {
            id: true,
            student: { select: { name: true, email: true } },
            teacher: { select: { name: true, email: true } },
          },
        },
        coursePurchase: {
          select: {
            id: true,
            student: { select: { name: true, email: true } },
            teacher: { select: { name: true, email: true } },
            course: { select: { title: true } },
          },
        },
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

  return { refundRequests, disputes, recentPayments, subscriptionInvoices };
}
