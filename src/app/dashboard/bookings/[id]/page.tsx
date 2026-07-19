import { ArrowLeft, CalendarDays, Clock3, CreditCard, UserRound, Video } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { StatusBadge, statusTone } from "@/features/admin/components/status-badge";
import { CancelBookingButton } from "@/features/bookings/components/cancel-booking-button";
import { RescheduleResponseCard } from "@/features/bookings/components/reschedule-response-card";
import { BookingCheckoutButtons } from "@/features/payments/components/booking-checkout-buttons";
import { ReviewForm } from "@/features/reviews/components/review-form";
import { formatCurrency, formatDateTime, formatStatus } from "@/lib/format";
import { routeLessonProviders } from "@/lib/payments/routing";
import { requireAuth } from "@/server/auth/session";
import { getBookingForUser } from "@/server/bookings/calendar";
import { expireAbandonedPayments } from "@/server/payments/confirm";

export const metadata: Metadata = { title: "Booking details" };

export default async function BookingDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ payment?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  await expireAbandonedPayments().catch(() => 0);
  const [booking, user] = await Promise.all([getBookingForUser(id), requireAuth()]);
  if (!booking) notFound();
  const isTeacher = booking.teacherId === user.id;
  const otherPerson = isTeacher ? booking.student : booking.teacher;
  const upcoming =
    booking.startsAt > new Date() &&
    (booking.status === "pending_payment" || booking.status === "confirmed");
  const providers = routeLessonProviders({
    currency: booking.currency,
    linkedProviders: booking.teacher.teacherPaymentAccounts.map((account) => account.provider),
  });

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-6">
          <Button
            variant="ghost"
            render={
              <Link
                href={isTeacher ? "/dashboard/teacher/bookings" : "/dashboard/bookings"}
              />
            }
          >
            <ArrowLeft className="size-4" aria-hidden />
            All bookings
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Booking</p>
            <h1 className="text-3xl font-semibold tracking-tight">
              Lesson with {otherPerson.name}
            </h1>
          </div>
          <StatusBadge tone={statusTone(booking.status)}>
            {formatStatus(booking.status)}
          </StatusBadge>
        </div>

        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <dl className="grid gap-5 sm:grid-cols-2">
            <Detail icon={CalendarDays} label="Date and time">
              {formatDateTime(booking.startsAt, user.timezone)}
            </Detail>
            <Detail icon={Clock3} label="Duration">60 minutes</Detail>
            <Detail icon={UserRound} label={isTeacher ? "Student" : "Teacher"}>
              {otherPerson.name}
            </Detail>
            <Detail icon={CreditCard} label="Lesson rate">
              {formatCurrency(booking.hourlyRateCents, booking.currency)}
            </Detail>
          </dl>
        </section>

        {booking.status === "pending_payment" ? (
          <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5">
            <p className="font-medium">Payment pending</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {isTeacher
                ? "Waiting for the student to complete checkout. The lesson confirms automatically after a verified payment."
                : `Your time is reserved${
                    booking.paymentExpiresAt
                      ? ` until ${formatDateTime(booking.paymentExpiresAt, user.timezone)}`
                      : ""
                  }. Pay the teacher directly — Amazing Skills takes no commission.`}
            </p>
            {query.payment === "cancelled" ? (
              <p className="mt-2 text-sm text-destructive">Checkout was cancelled. You can try again.</p>
            ) : null}
            {query.payment === "return" ? (
              <p className="mt-2 text-sm text-muted-foreground">
                If you completed payment, confirmation can take a few seconds while we verify the
                provider webhook.
              </p>
            ) : null}
            {!isTeacher ? (
              <BookingCheckoutButtons bookingId={booking.id} providers={providers} />
            ) : null}
          </section>
        ) : null}

        {booking.rescheduleProposals[0] ? (
          <RescheduleResponseCard
            proposalId={booking.rescheduleProposals[0].id}
            currentStartsAt={booking.startsAt}
            proposedStartsAt={booking.rescheduleProposals[0].proposedStartsAt}
            timeZone={user.timezone}
            viewer={isTeacher ? "teacher" : "student"}
          />
        ) : null}

        {booking.status === "confirmed" && booking.videoSession ? (
          <section className="flex flex-col gap-4 rounded-xl border border-primary/30 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Private video room ready</p>
              <p className="mt-1 text-sm text-muted-foreground">
                The lobby opens 15 minutes before the scheduled lesson.
              </p>
            </div>
            <Button render={<Link href={`/sessions/${booking.videoSession.id}`} />}>
              <Video className="size-4" aria-hidden />
              Open lesson lobby
            </Button>
          </section>
        ) : null}

        {booking.status === "cancelled" && booking.cancellationReason ? (
          <section className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm font-medium">Cancellation reason</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {booking.cancellationReason}
            </p>
          </section>
        ) : null}

        {upcoming ? <CancelBookingButton bookingId={booking.id} /> : null}

        {booking.status === "completed" && !isTeacher && !booking.review ? (
          <ReviewForm bookingId={booking.id} />
        ) : null}
      </main>
    </div>
  );
}

function Detail({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof CalendarDays;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="rounded-lg bg-primary/10 p-2 text-primary">
        <Icon className="size-4" aria-hidden />
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 text-sm font-medium">{children}</dd>
      </div>
    </div>
  );
}
