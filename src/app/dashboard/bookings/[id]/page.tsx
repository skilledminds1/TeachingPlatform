import { ArrowLeft, CalendarDays, Clock3, CreditCard, UserRound, Video } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { StatusBadge, statusTone } from "@/features/admin/components/status-badge";
import { CancelBookingButton } from "@/features/bookings/components/cancel-booking-button";
import { ReviewForm } from "@/features/reviews/components/review-form";
import { ConfirmVideoBookingButton } from "@/features/video/components/confirm-video-booking-button";
import { formatCurrency, formatDateTime, formatStatus } from "@/lib/format";
import { requireAuth } from "@/server/auth/session";
import { getBookingForUser } from "@/server/bookings/calendar";

export const metadata: Metadata = { title: "Booking details" };

export default async function BookingDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [booking, user] = await Promise.all([getBookingForUser(id), requireAuth()]);
  if (!booking) notFound();
  const isTeacher = booking.teacherId === user.id;
  const otherPerson = isTeacher ? booking.student : booking.teacher;
  const upcoming =
    booking.startsAt > new Date() &&
    (booking.status === "pending_payment" || booking.status === "confirmed");

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
              Your time is reserved. Direct Stripe or PayPal checkout will be connected in the
              teacher-payments phase.
            </p>
            {isTeacher ? (
              <div className="mt-4">
                <ConfirmVideoBookingButton bookingId={booking.id} />
              </div>
            ) : null}
          </section>
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
