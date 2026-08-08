import { db } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { requireTeacher } from "@/server/auth/session";

/**
 * What a teacher has been paid, according to the teacher.
 *
 * This used to sum PaymentAttempt rows — a ledger the platform wrote when it captured a
 * PayPal payment on the teacher's behalf. That rail is gone, and with it any possibility of
 * the platform observing a payment: students now pay teachers directly on the teacher's own
 * provider, and nothing reports back.
 *
 * So this is a record of what the teacher marked as received, and it is labelled that way
 * wherever it is shown. It is NOT accounting, it is not reconciled against a bank, and it
 * cannot be — the authoritative figures live in the teacher's own payment provider. Presenting
 * it as anything firmer would be inventing precision the platform does not have.
 */
export async function getTeacherEarningsSummary() {
  const user = await requireTeacher();
  const bookings = await db.booking.findMany({
    where: {
      teacherId: user.id,
      paymentReportedAt: { not: null },
      status: { in: ["confirmed", "completed"] },
    },
    select: {
      id: true,
      hourlyRateCents: true,
      currency: true,
      paymentReportedAt: true,
      paymentReference: true,
      startsAt: true,
    },
    orderBy: { paymentReportedAt: "desc" },
    take: 100,
  });

  const byCurrency = new Map<string, { gross: number; count: number }>();
  for (const booking of bookings) {
    const current = byCurrency.get(booking.currency) ?? { gross: 0, count: 0 };
    current.gross += booking.hourlyRateCents;
    current.count += 1;
    byCurrency.set(booking.currency, current);
  }

  return {
    totals: [...byCurrency.entries()].map(([currency, totals]) => ({
      currency,
      ...totals,
      grossLabel: formatCurrency(totals.gross, currency),
      // Kept as a distinct field so callers that showed a "net" figure keep working. There is
      // no platform commission and no fee the platform can see, so gross and net are the same
      // number — the teacher's provider takes its cut where the platform cannot observe it.
      netLabel: formatCurrency(totals.gross, currency),
    })),
    recent: bookings.slice(0, 10).map((booking) => ({
      bookingId: booking.id,
      currency: booking.currency,
      reportedAt: booking.paymentReportedAt,
      reference: booking.paymentReference,
      startsAt: booking.startsAt,
      label: formatCurrency(booking.hourlyRateCents, booking.currency),
    })),
  };
}
