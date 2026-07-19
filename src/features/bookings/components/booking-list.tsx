import { CalendarDays } from "lucide-react";
import Link from "next/link";

import { StatusBadge, statusTone } from "@/features/admin/components/status-badge";
import { formatCurrency, formatDateTime, formatStatus } from "@/lib/format";

type Booking = {
  id: string;
  startsAt: Date;
  status: string;
  hourlyRateCents: number;
  currency: string;
  teacher: { name: string };
  student: { name: string };
};

export function BookingList({
  bookings,
  viewer,
  timeZone,
}: {
  bookings: Booking[];
  viewer: "teacher" | "student";
  timeZone: string;
}) {
  if (bookings.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center shadow-sm">
        <CalendarDays className="mx-auto size-8 text-muted-foreground" aria-hidden />
        <h2 className="mt-3 font-semibold">No bookings yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {viewer === "teacher"
            ? "Student reservations will appear here."
            : "Browse Find Tutor to reserve your first lesson."}
        </p>
      </div>
    );
  }

  const now = new Date();
  const upcoming = bookings.filter(
    (booking) =>
      booking.startsAt >= now &&
      (booking.status === "pending_payment" || booking.status === "confirmed"),
  );
  const history = bookings.filter((booking) => !upcoming.includes(booking)).reverse();

  return (
    <div className="space-y-6">
      <BookingSection
        title="Upcoming"
        bookings={upcoming}
        viewer={viewer}
        timeZone={timeZone}
      />
      <BookingSection
        title="History"
        bookings={history}
        viewer={viewer}
        timeZone={timeZone}
      />
    </div>
  );
}

function BookingSection({
  title,
  bookings,
  viewer,
  timeZone,
}: {
  title: string;
  bookings: Booking[];
  viewer: "teacher" | "student";
  timeZone: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-semibold">{title}</h2>
      </div>
      {bookings.length > 0 ? (
        <ul className="divide-y divide-border">
          {bookings.map((booking) => (
            <li key={booking.id}>
              <Link
                href={`/dashboard/bookings/${booking.id}`}
                className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium">
                    {viewer === "teacher" ? booking.student.name : booking.teacher.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDateTime(booking.startsAt, timeZone)} ·{" "}
                    {formatCurrency(booking.hourlyRateCents, booking.currency)}
                  </p>
                </div>
                <StatusBadge tone={statusTone(booking.status)}>
                  {formatStatus(booking.status)}
                </StatusBadge>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
          No {title.toLowerCase()} bookings.
        </p>
      )}
    </section>
  );
}
