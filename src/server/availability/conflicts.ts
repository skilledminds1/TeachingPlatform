import { db } from "@/lib/db";

export type LessonConflict = {
  bookingId: string;
  studentId: string;
  studentName: string;
  studentAvatarUrl: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
};

export async function findLessonConflictsForRange(input: {
  teacherId: string;
  start: Date;
  end: Date;
}): Promise<LessonConflict[]> {
  const bookings = await db.booking.findMany({
    where: {
      teacherId: input.teacherId,
      status: { in: ["pending_teacher_confirmation", "confirmed"] },
      startsAt: { lt: input.end },
      endsAt: { gt: input.start },
    },
    orderBy: { startsAt: "asc" },
    include: {
      student: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  return bookings.map((booking) => ({
    bookingId: booking.id,
    studentId: booking.student.id,
    studentName: booking.student.name,
    studentAvatarUrl: booking.student.avatarUrl,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    status: booking.status,
  }));
}
