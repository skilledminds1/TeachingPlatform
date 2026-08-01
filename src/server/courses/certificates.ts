import { db } from "@/lib/db";

export async function issueCertificateIfEligible(courseId: string, studentId: string) {
  const existing = await db.courseCertificate.findUnique({
    where: { courseId_studentId: { courseId, studentId } },
  });
  // MON-35: only a live certificate short-circuits. A revoked one falls through so
  // eligibility is re-checked — the enrollment filter below requires revokedAt: null, so it
  // is only reinstated if the student genuinely has access again (for example after
  // re-purchasing), and the upsert clears the revocation.
  if (existing && !existing.revokedAt) return existing;

  const course = await db.course.findFirst({
    where: {
      id: courseId,
      deletedAt: null,
      certificateEnabled: true,
      enrollments: { some: { studentId, revokedAt: null } },
    },
    select: {
      id: true,
      title: true,
      teacherId: true,
      teacher: { select: { name: true } },
      modules: {
        select: {
          lessons: {
            select: {
              id: true,
              progress: {
                where: { studentId, completedAt: { not: null } },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      },
    },
  });
  if (!course) return null;

  const lessons = course.modules.flatMap((courseModule) => courseModule.lessons);
  if (lessons.length === 0 || lessons.some((lesson) => lesson.progress.length === 0)) {
    return null;
  }

  const student = await db.user.findFirst({
    where: { id: studentId, deletedAt: null },
    select: { name: true },
  });
  if (!student) return null;

  return db.courseCertificate.upsert({
    where: { courseId_studentId: { courseId, studentId } },
    create: {
      courseId,
      studentId,
      teacherId: course.teacherId,
      verificationCode: `cert_${crypto.randomUUID().replaceAll("-", "")}`,
      studentName: student.name,
      courseTitle: course.title,
      teacherName: course.teacher.name,
    },
    // Reinstate a previously revoked certificate when access is genuinely restored. The
    // verification code is preserved so any link already shared stays valid.
    update: { revokedAt: null, revocationReason: null },
  });
}
