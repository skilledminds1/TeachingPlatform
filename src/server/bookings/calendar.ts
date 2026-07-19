import { db } from "@/lib/db";
import { requireAuth, requireTeacher } from "@/server/auth/session";

const bookingInclude = {
  teacher: { select: { id: true, name: true, avatarUrl: true } },
  student: { select: { id: true, name: true, avatarUrl: true } },
  videoSession: { select: { id: true, status: true } },
  review: { select: { id: true, rating: true, status: true } },
} as const;

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
      teacher: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          teacherPaymentAccounts: {
            where: {
              isActive: true,
              onboardingStatus: "complete",
              provider: "paypal",
            },
            select: { provider: true },
          },
        },
      },
    },
  });
}
