import { DateTime } from "luxon";

import { db } from "@/lib/db";
import { timeValue } from "@/lib/timezone";
import { requireAuth, requireTeacher } from "@/server/auth/session";
import { hasFeature } from "@/server/billing/entitlements";
import { getCalendarConnection } from "@/server/integrations/google-calendar";

const bookingInclude = {
  teacher: { select: { id: true, name: true, avatarUrl: true } },
  student: { select: { id: true, name: true, avatarUrl: true } },
  videoSession: { select: { id: true, status: true } },
  review: { select: { id: true, rating: true, status: true } },
} as const;

export type CalendarBooking = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  studentId: string;
  studentName: string;
  studentAvatarUrl: string | null;
  isFirstLesson: boolean;
  completedLessons: number;
  pendingProposal: {
    id: string;
    proposedStartsAt: string;
    proposedEndsAt: string;
  } | null;
};

export type CalendarException = {
  id: string;
  specificDate: string;
  startTime: string;
  endTime: string;
  isBlocked: boolean;
  title: string | null;
};

export type CalendarAvailability = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export type CalendarStudentOption = {
  studentId: string;
  name: string;
  avatarUrl: string | null;
};

function mondayOfWeek(isoDate: string, timeZone: string): DateTime {
  const parsed = DateTime.fromISO(isoDate, { zone: timeZone }).startOf("day");
  const base = parsed.isValid ? parsed : DateTime.now().setZone(timeZone).startOf("day");
  const weekday = base.weekday; // 1=Mon ... 7=Sun
  return base.minus({ days: weekday - 1 }).startOf("day");
}

export function resolveWeekStart(weekParam: string | undefined, timeZone: string): DateTime {
  if (weekParam) {
    return mondayOfWeek(weekParam, timeZone);
  }
  return mondayOfWeek(DateTime.now().setZone(timeZone).toISODate()!, timeZone);
}

export async function getStudentBookings() {
  const user = await requireAuth();
  return db.booking.findMany({
    where: { studentId: user.id },
    orderBy: { startsAt: "asc" },
    include: bookingInclude,
  });
}

export async function getTeacherBookings() {
  const user = await requireTeacher();
  return {
    user,
    bookings: await db.booking.findMany({
      where: { teacherId: user.id },
      orderBy: { startsAt: "asc" },
      include: bookingInclude,
    }),
  };
}

export async function getBookingForUser(bookingId: string) {
  const user = await requireAuth();
  return db.booking.findFirst({
    where: {
      id: bookingId,
      OR: [{ teacherId: user.id }, { studentId: user.id }],
    },
    include: {
      ...bookingInclude,
      rescheduleProposals: {
        where: { status: "pending", expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      // Safeguarding: a teacher must know they are about to meet a child on video, and the
      // date of birth is what decides it. Selected here rather than derived in the component
      // so the rule lives in one place.
      student: { select: { id: true, name: true, avatarUrl: true, dateOfBirth: true } },
      refundRequest: {
        select: {
          id: true,
          status: true,
          requestedAmountCents: true,
          currency: true,
          reason: true,
          policyEligible: true,
          teacherResponse: true,
          providerRefundId: true,
        },
      },
      teacher: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          // The destination a student is sent to in order to pay. Read from the profile so
          // there is one source of truth for it rather than a copy on the booking.
          teacherProfile: {
            select: { paymentLinkUrl: true, paymentLinkHost: true },
          },
        },
      },
    },
  });
}

export async function getTeacherCalendarWeek(weekParam?: string) {
  const user = await requireTeacher();
  const weekStart = resolveWeekStart(weekParam, user.timezone);
  const weekEnd = weekStart.plus({ days: 7 });
  const rangeStart = weekStart.toUTC().toJSDate();
  const rangeEnd = weekEnd.toUTC().toJSDate();
  const weekDates = Array.from({ length: 7 }, (_, index) => {
    const iso = weekStart.plus({ days: index }).toISODate()!;
    return new Date(`${iso}T00:00:00.000Z`);
  });

  const profile = await db.teacherProfile.findUnique({
    where: { userId: user.id },
    select: { organizationId: true },
  });

  const [bookings, exceptions, availability, relationships, priorCounts, completedCounts, calendarConnection] =
    await Promise.all([
      db.booking.findMany({
        where: {
          teacherId: user.id,
          startsAt: { lt: rangeEnd },
          endsAt: { gt: rangeStart },
          status: { in: ["pending_teacher_confirmation", "confirmed", "completed"] },
        },
        orderBy: { startsAt: "asc" },
        include: {
          student: { select: { id: true, name: true, avatarUrl: true } },
          rescheduleProposals: {
            where: { status: "pending", expiresAt: { gt: new Date() } },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              proposedStartsAt: true,
              proposedEndsAt: true,
            },
          },
        },
      }),
      db.availabilityException.findMany({
        where: {
          userId: user.id,
          specificDate: { in: weekDates },
        },
        orderBy: [{ specificDate: "asc" }, { startTime: "asc" }],
      }),
      db.availability.findMany({
        where: { userId: user.id },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      }),
      db.studentRelationship.findMany({
        where: { teacherId: user.id, status: "active" },
        orderBy: { createdAt: "asc" },
        include: {
          student: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
      db.booking.groupBy({
        by: ["studentId"],
        where: {
          teacherId: user.id,
          status: { in: ["confirmed", "completed"] },
        },
        _count: { _all: true },
      }),
      db.booking.groupBy({
        by: ["studentId"],
        where: {
          teacherId: user.id,
          status: "completed",
        },
        _count: { _all: true },
      }),
      getCalendarConnection(user.id),
    ]);

  const priorByStudent = new Map(
    priorCounts.map((row) => [row.studentId, row._count._all] as const),
  );
  const completedByStudent = new Map(
    completedCounts.map((row) => [row.studentId, row._count._all] as const),
  );

  const calendarBookings: CalendarBooking[] = bookings.map((booking) => {
    const prior = priorByStudent.get(booking.student.id) ?? 0;
    const countsTowardPrior =
      booking.status === "confirmed" || booking.status === "completed";
    const pending = booking.rescheduleProposals[0] ?? null;
    return {
      id: booking.id,
      startsAt: booking.startsAt.toISOString(),
      endsAt: booking.endsAt.toISOString(),
      status: booking.status,
      studentId: booking.student.id,
      studentName: booking.student.name,
      studentAvatarUrl: booking.student.avatarUrl,
      isFirstLesson: countsTowardPrior ? prior <= 1 : prior === 0,
      completedLessons: completedByStudent.get(booking.student.id) ?? 0,
      pendingProposal: pending
        ? {
            id: pending.id,
            proposedStartsAt: pending.proposedStartsAt.toISOString(),
            proposedEndsAt: pending.proposedEndsAt.toISOString(),
          }
        : null,
    };
  });

  const calendarExceptions: CalendarException[] = exceptions.map((exception) => ({
    id: exception.id,
    specificDate: DateTime.fromJSDate(exception.specificDate, { zone: "utc" }).toISODate()!,
    startTime: timeValue(exception.startTime),
    endTime: timeValue(exception.endTime),
    isBlocked: exception.isBlocked,
    title: exception.title,
  }));

  const calendarAvailability: CalendarAvailability[] = availability.map((slot) => ({
    id: slot.id,
    dayOfWeek: slot.dayOfWeek,
    startTime: timeValue(slot.startTime),
    endTime: timeValue(slot.endTime),
  }));

  const students: CalendarStudentOption[] = relationships.map((relationship) => ({
    studentId: relationship.student.id,
    name: relationship.student.name,
    avatarUrl: relationship.student.avatarUrl,
  }));

  const canUseExceptions = profile
    ? await hasFeature(profile.organizationId, "custom_availability")
    : false;

  return {
    user,
    weekStartIso: weekStart.toISODate()!,
    weekEndIso: weekStart.plus({ days: 6 }).toISODate()!,
    timeZone: user.timezone,
    bookings: calendarBookings,
    exceptions: calendarExceptions,
    availability: calendarAvailability,
    students,
    canUseExceptions,
    googleCalendar: calendarConnection
      ? { connected: true as const, email: calendarConnection.googleEmail }
      : { connected: false as const, email: null },
    allBookings: await db.booking.findMany({
      where: { teacherId: user.id },
      orderBy: { startsAt: "asc" },
      include: bookingInclude,
    }),
  };
}
