import { db } from "@/lib/db";
import { requireTeacher } from "@/server/auth/session";

export type TeacherStudentRow = {
  relationshipId: string;
  studentId: string;
  name: string;
  avatarUrl: string | null;
  status: "active" | "archived";
  completedLessons: number;
  totalLessons: number;
  nextLessonAt: Date | null;
};

export async function getTeacherStudents() {
  const user = await requireTeacher();

  const relationships = await db.studentRelationship.findMany({
    where: { teacherId: user.id },
    orderBy: { createdAt: "asc" },
    include: {
      student: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  const studentIds = relationships.map((relationship) => relationship.studentId);
  const bookings = studentIds.length
    ? await db.booking.findMany({
        where: {
          teacherId: user.id,
          studentId: { in: studentIds },
          status: { in: ["confirmed", "completed"] },
        },
        select: { studentId: true, status: true, startsAt: true },
      })
    : [];

  const now = new Date();
  const students: TeacherStudentRow[] = relationships.map((relationship) => {
    const own = bookings.filter((booking) => booking.studentId === relationship.studentId);
    const completedLessons = own.filter((booking) => booking.status === "completed").length;
    const upcoming = own
      .filter((booking) => booking.status === "confirmed" && booking.startsAt > now)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

    return {
      relationshipId: relationship.id,
      studentId: relationship.studentId,
      name: relationship.student.name,
      avatarUrl: relationship.student.avatarUrl,
      status: relationship.status,
      completedLessons,
      totalLessons: own.length,
      nextLessonAt: upcoming[0]?.startsAt ?? null,
    };
  });

  students.sort((a, b) => a.name.localeCompare(b.name));

  return { user, students };
}
