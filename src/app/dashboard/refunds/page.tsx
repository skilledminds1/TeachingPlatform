import { HandCoins } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { StatusBadge, statusTone } from "@/features/admin/components/status-badge";
import { StudentNavWithNotifications } from "@/features/student-dashboard/components/student-nav-with-notifications";
import { formatCurrency, formatDateTime, formatStatus } from "@/lib/format";
import { db } from "@/lib/db";
import { requireAuth } from "@/server/auth/session";

export const metadata: Metadata = { title: "Refund requests" };

export default async function StudentRefundsPage() {
  const student = await requireAuth();
  const requests = await db.refundRequest.findMany({
    where: { studentId: student.id },
    orderBy: { requestedAt: "desc" },
    include: {
      teacher: { select: { name: true } },
      booking: { select: { id: true, startsAt: true } },
      coursePurchase: {
        select: {
          id: true,
          course: { select: { title: true } },
        },
      },
    },
  });

  return (
    <div className="min-h-screen bg-muted/30">
      <StudentNavWithNotifications />
      <main className="mx-auto max-w-5xl space-y-8 px-6 py-8 md:py-12">
        <div className="flex items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <HandCoins className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Refund requests</h1>
            <p className="mt-1 text-muted-foreground">
              Track requests sent directly to your teachers.
            </p>
          </div>
        </div>

        <section className="rounded-xl border border-border bg-card p-5 text-sm shadow-sm">
          <p className="font-medium">How refunds work</p>
          <p className="mt-1 text-muted-foreground">
            Teachers receive lesson and course payments directly and are responsible for refunds.
            Amazing Skills can mediate a disagreement and take action against a teacher account,
            but does not hold the funds and cannot issue or guarantee a refund.
          </p>
        </section>

        <section className="space-y-4">
          {requests.map((request) => {
            const href = request.moderationCaseId
              ? `/dashboard/cases/${request.moderationCaseId}`
              : request.booking
                ? `/dashboard/bookings/${request.booking.id}`
                : `/dashboard/courses/purchases/${request.coursePurchase?.id}`;
            return (
              <article
                key={request.id}
                className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">
                      {request.booking
                        ? `Live lesson · ${formatDateTime(request.booking.startsAt, student.timezone)}`
                        : request.coursePurchase?.course.title ?? "Course purchase"}
                    </p>
                    <StatusBadge tone={statusTone(request.status)}>
                      {formatStatus(request.status)}
                    </StatusBadge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Teacher: {request.teacher.name} ·{" "}
                    {formatCurrency(request.requestedAmountCents, request.currency)}
                  </p>
                </div>
                <Button variant="outline" render={<Link href={href} />}>
                  {request.moderationCaseId ? "Open mediation" : "View request"}
                </Button>
              </article>
            );
          })}
          {requests.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No refund requests.
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
