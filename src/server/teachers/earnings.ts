import { db } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { requireTeacher } from "@/server/auth/session";

export async function getTeacherEarningsSummary() {
  const user = await requireTeacher();
  const attempts = await db.paymentAttempt.findMany({
    where: {
      teacherMerchantId: { not: "" },
      status: { in: ["succeeded", "refunded", "partially_refunded"] },
      booking: { teacherId: user.id },
    },
    select: {
      amountCents: true,
      refundedCents: true,
      currency: true,
      status: true,
      succeededAt: true,
      provider: true,
    },
    orderBy: { succeededAt: "desc" },
    take: 100,
  });

  const byCurrency = new Map<string, { gross: number; refunded: number; net: number; count: number }>();
  for (const attempt of attempts) {
    const current = byCurrency.get(attempt.currency) ?? {
      gross: 0,
      refunded: 0,
      net: 0,
      count: 0,
    };
    current.gross += attempt.amountCents;
    current.refunded += attempt.refundedCents;
    current.net += attempt.amountCents - attempt.refundedCents;
    current.count += 1;
    byCurrency.set(attempt.currency, current);
  }

  return {
    totals: [...byCurrency.entries()].map(([currency, totals]) => ({
      currency,
      ...totals,
      grossLabel: formatCurrency(totals.gross, currency),
      netLabel: formatCurrency(totals.net, currency),
    })),
    recent: attempts.slice(0, 10).map((attempt) => ({
      ...attempt,
      netCents: attempt.amountCents - attempt.refundedCents,
      label: formatCurrency(attempt.amountCents - attempt.refundedCents, attempt.currency),
    })),
  };
}
