import { ArrowLeft, CalendarDays, Clock3, CreditCard, UserRound, Video } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { isMinor } from "@/lib/age";
import { Button } from "@/components/ui/button";
import { StatusBadge, statusTone } from "@/features/admin/components/status-badge";
import { CancelBookingButton } from "@/features/bookings/components/cancel-booking-button";
import { ConfirmVideoBookingButton } from "@/features/video/components/confirm-video-booking-button";
import { RescheduleResponseCard } from "@/features/bookings/components/reschedule-response-card";
import { PayYourTeacherPanel } from "@/features/payments/components/pay-your-teacher-panel";
import { RefundRequestPanel } from "@/features/payments/components/refund-request-panel";
import { ReviewForm } from "@/features/reviews/components/review-form";
import { formatCurrency, formatDateTime, formatStatus } from "@/lib/format";
import { requireAuth } from "@/server/auth/session";
import { getBookingForUser } from "@/server/bookings/calendar";

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
  const [booking, user] = await Promise.all([getBookingForUser(id), requireAuth()]);
  if (!booking) notFound();
  const isTeacher = booking.teacherId === user.id;
  const otherPerson = isTeacher ? booking.student : booking.teacher;
  const upcoming =
    booking.startsAt > new Date() &&
    (booking.status === "pending_teacher_confirmation" || booking.status === "confirmed");

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
      <main id="main-content" className="mx-auto max-w-3xl space-y-6 px-6 py-10">
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

        {isTeacher && isMinor(booking.student.dateOfBirth) === true ? (
          <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5">
            <p className="font-medium">This student is under 18</p>
            <p className="mt-1 text-sm text-muted-foreground">
              A parent or guardian has given permission for these lessons. Keep the lesson in
              the platform&apos;s video room, keep communication in platform messaging, and
              raise anything that concerns you through{" "}
              <Link href="/dashboard/safety" className="font-medium text-primary hover:underline">
                Trust &amp; Safety
              </Link>
              .
            </p>
          </section>
        ) : null}

        {booking.status === "pending_teacher_confirmation" ? (
          <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5">
            <p className="font-medium">
              {isTeacher ? "Awaiting your answer" : "Waiting for the teacher to confirm"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {isTeacher
                ? `This slot is held for you${
                    booking.confirmationExpiresAt
                      ? ` until ${formatDateTime(booking.confirmationExpiresAt, user.timezone)}`
                      : ""
                  }. Accepting confirms the lesson and opens the video room.`
                : `Your time is reserved${
                    booking.confirmationExpiresAt
                      ? ` until ${formatDateTime(booking.confirmationExpiresAt, user.timezone)}`
                      : ""
                  }. Arrange payment with your teacher directly — Amazing Skills never handles this money and cannot refund it.`}
            </p>
            {query.payment === "cancelled" ? (
              <p className="mt-2 text-sm text-destructive">Checkout was cancelled. You can try again.</p>
            ) : null}
            {query.payment === "pending" ? (
              <p className="mt-2 text-sm text-muted-foreground">
                If you completed payment, confirmation can take a few seconds while we verify the
                provider webhook.
              </p>
            ) : null}
            {query.payment === "error" ? (
              <p className="mt-2 text-sm text-destructive">
                We could not verify the payment yet. Your payment record is unchanged; refresh
                shortly or contact support if it remains pending.
              </p>
            ) : null}
            {isTeacher ? (
              <div className="mt-4 space-y-4">
                {/*
                  PAY-15: the prompt lives here rather than in onboarding. A payment method is
                  not required to be listed, so this is the first moment it actually matters —
                  a real student, on a real slot, with no way to pay.
                */}
                {!booking.teacher.teacherProfile?.paymentLinkUrl ? (
                  <div className="rounded-lg border border-border bg-background/60 p-4 text-sm">
                    <p className="font-medium">Your student has no way to pay you yet</p>
                    <p className="mt-1 text-muted-foreground">
                      You can still accept this lesson, but set up how students pay you before it
                      starts. Payments go directly to you — Amazing Skills never handles them.
                    </p>
                    <Link
                      href="/dashboard/teacher/payments"
                      className="mt-2 inline-block font-medium text-primary hover:underline"
                    >
                      Set up how students pay you
                    </Link>
                  </div>
                ) : null}
                <ConfirmVideoBookingButton bookingId={booking.id} />
              </div>
            ) : null}
            {!isTeacher ? (
              <div className="space-y-3">
                <PayYourTeacherPanel
                  teacherName={booking.teacher.name}
                  paymentLinkUrl={booking.teacher.teacherProfile?.paymentLinkUrl ?? null}
                  paymentLinkHost={booking.teacher.teacherProfile?.paymentLinkHost ?? null}
                  reference={booking.id.slice(0, 8).toUpperCase()}
                  amountLabel={formatCurrency(booking.hourlyRateCents, booking.currency)}
                />
                <p className="text-xs text-muted-foreground">
                  Refunds are arranged with your teacher under our{" "}
                  <Link href="/refund-policy" className="font-medium text-primary hover:underline">
                    refund policy
                  </Link>
                  .
                </p>
              </div>
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

        {!isTeacher &&
        booking.paymentExternalId &&
        ["confirmed", "cancelled", "completed", "no_show"].includes(booking.status) ? (
          <RefundRequestPanel targetId={booking.id} request={booking.refundRequest} />
        ) : null}

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
