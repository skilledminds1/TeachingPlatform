import { HandCoins } from "lucide-react";
import type { Metadata } from "next";

import { TeacherRefundCard } from "@/features/payments/components/teacher-refund-card";
import { formatDateTime } from "@/lib/format";
import { db } from "@/lib/db";
import { requireTeacher } from "@/server/auth/session";

export const metadata: Metadata = { title: "Refund requests" };

export default async function TeacherRefundsPage() {
  const teacher = await requireTeacher();
  const requests = await db.refundRequest.findMany({
    where: { teacherId: teacher.id },
    orderBy: { requestedAt: "desc" },
    include: {
      student: { select: { name: true } },
      booking: { select: { startsAt: true } },
      coursePurchase: {
        select: { course: { select: { title: true } } },
      },
    },
  });

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-8 md:py-12">
      <div className="flex items-start gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <HandCoins className="size-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Refund requests</h1>
          <p className="mt-1 text-muted-foreground">
            Review student requests and record refunds issued from your own payment account.
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm">
        <p className="font-medium">You are responsible for student refunds</p>
        <p className="mt-1 text-muted-foreground">
          Amazing Skills does not receive or hold lesson and course payments. Respond promptly,
          explain your decision, and issue approved refunds directly through your payment method.
          Unresolved disputes may be reviewed by the platform and can affect marketplace access.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {requests.map((request) => (
          <TeacherRefundCard
            key={request.id}
            request={{
              id: request.id,
              status: request.status,
              requestedAmountCents: request.requestedAmountCents,
              currency: request.currency,
              reason: request.reason,
              policyEligible: request.policyEligible,
              teacherResponse: request.teacherResponse,
              providerRefundId: request.providerRefundId,
              moderationCaseId: request.moderationCaseId,
              studentName: request.student.name,
              targetLabel: request.booking
                ? `Live lesson · ${formatDateTime(request.booking.startsAt, teacher.timezone)}`
                : request.coursePurchase?.course.title ?? "Course purchase",
            }}
          />
        ))}
        {requests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground lg:col-span-2">
            No refund requests.
          </div>
        ) : null}
      </section>
    </main>
  );
}
