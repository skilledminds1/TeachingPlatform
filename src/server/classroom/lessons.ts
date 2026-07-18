import { db } from "@/lib/db";
import { hasTeacherMembership, requireAuth } from "@/server/auth/session";

const lessonSelect = {
  id: true,
  startsAt: true,
  endsAt: true,
  status: true,
  teacherId: true,
  studentId: true,
  teacher: { select: { id: true, name: true, avatarUrl: true } },
  student: { select: { id: true, name: true, avatarUrl: true } },
  videoSession: { select: { id: true, status: true } },
} as const;

export async function getClassroomLessons() {
  const user = await requireAuth();
  const isTeacher = hasTeacherMembership(user);
  const now = new Date();
  // Lobby opens 15 min early; keep rooms visible 30 min after end for reconnect.
  const windowStart = new Date(now.getTime() - 30 * 60_000);
  const windowEnd = new Date(now.getTime() + 14 * 24 * 60 * 60_000);

  const bookings = await db.booking.findMany({
    where: {
      OR: [{ teacherId: user.id }, { studentId: user.id }],
      status: { in: ["confirmed", "completed"] },
      startsAt: { lte: windowEnd },
      endsAt: { gte: windowStart },
    },
    orderBy: { startsAt: "asc" },
    select: lessonSelect,
  });

  const lessons = bookings.map((booking) => {
    const other = booking.teacherId === user.id ? booking.student : booking.teacher;
    const earliestJoin = new Date(booking.startsAt.getTime() - 15 * 60_000);
    const latestJoin = new Date(booking.endsAt.getTime() + 30 * 60_000);
    const sessionStatus = booking.videoSession?.status ?? null;
    const isLive = sessionStatus === "live";
    const canJoin =
      Boolean(booking.videoSession) &&
      booking.status === "confirmed" &&
      now >= earliestJoin &&
      now <= latestJoin &&
      sessionStatus !== "ended";

    return {
      bookingId: booking.id,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      bookingStatus: booking.status,
      other,
      videoSessionId: booking.videoSession?.id ?? null,
      sessionStatus,
      isLive,
      canJoin,
      isTeacherViewer: booking.teacherId === user.id,
    };
  });

  const live = lessons.filter((lesson) => lesson.isLive || lesson.canJoin);
  const upcoming = lessons.filter(
    (lesson) =>
      !live.includes(lesson) &&
      lesson.bookingStatus === "confirmed" &&
      lesson.startsAt > now,
  );
  const recent = lessons
    .filter(
      (lesson) =>
        !live.includes(lesson) &&
        !upcoming.includes(lesson) &&
        (lesson.sessionStatus === "ended" || lesson.bookingStatus === "completed"),
    )
    .reverse();

  return {
    user,
    isTeacher,
    live,
    upcoming,
    recent,
  };
}
