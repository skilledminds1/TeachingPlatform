import type { Metadata } from "next";

import {
  StudentsTable,
  type StudentTableRow,
} from "@/features/teacher-dashboard/components/students-table";
import { formatDateTime } from "@/lib/format";
import { getTeacherStudents } from "@/server/teachers/students";

export const metadata: Metadata = { title: "My students" };

export default async function TeacherStudentsPage() {
  const { user, students } = await getTeacherStudents();

  const rows: StudentTableRow[] = students.map((student) => ({
    relationshipId: student.relationshipId,
    name: student.name,
    avatarUrl: student.avatarUrl,
    status: student.status,
    completedLessons: student.completedLessons,
    totalLessons: student.totalLessons,
    nextLessonLabel: student.nextLessonAt
      ? formatDateTime(student.nextLessonAt, user.timezone)
      : null,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8 md:py-12">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">My students</h1>
      <StudentsTable students={rows} />
    </div>
  );
}
