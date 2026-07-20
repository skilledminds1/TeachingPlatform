import type { SessionUser } from "@/server/auth/session";

import { db } from "@/lib/db";

export async function canAccessModerationCase(
  caseId: string,
  user: Pick<SessionUser, "id" | "isPlatformAdmin">,
): Promise<boolean> {
  if (user.isPlatformAdmin) {
    return Boolean(await db.moderationCase.findUnique({ where: { id: caseId }, select: { id: true } }));
  }
  return Boolean(
    await db.moderationCase.findFirst({
      where: {
        id: caseId,
        OR: [
          { reporterId: user.id },
          { subjectId: user.id },
          { refundRequest: { is: { studentId: user.id } } },
          { refundRequest: { is: { teacherId: user.id } } },
        ],
      },
      select: { id: true },
    }),
  );
}

export async function getParticipantCase(caseId: string, userId: string) {
  return db.moderationCase.findFirst({
    where: {
      id: caseId,
      OR: [
        { reporterId: userId },
        { subjectId: userId },
        { refundRequest: { is: { studentId: userId } } },
        { refundRequest: { is: { teacherId: userId } } },
      ],
    },
    include: {
      assignedAdmin: { select: { id: true, name: true } },
      refundRequest: {
        include: {
          student: { select: { id: true, name: true } },
          teacher: { select: { id: true, name: true } },
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { sender: { select: { id: true, name: true, isPlatformAdmin: true } } },
      },
      evidence: {
        orderBy: { createdAt: "asc" },
        include: { uploadedBy: { select: { id: true, name: true, isPlatformAdmin: true } } },
      },
      sanctions: {
        where: { userId },
        orderBy: { createdAt: "desc" },
        include: { appeals: { where: { appellantId: userId }, take: 1 } },
      },
    },
  });
}

export async function getAdminCase(caseId: string) {
  return db.moderationCase.findUnique({
    where: { id: caseId },
    include: {
      reporter: { select: { id: true, name: true, email: true } },
      subject: { select: { id: true, name: true, email: true } },
      assignedAdmin: { select: { id: true, name: true } },
      refundRequest: {
        include: {
          student: { select: { id: true, name: true, email: true } },
          teacher: { select: { id: true, name: true, email: true } },
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { sender: { select: { id: true, name: true, isPlatformAdmin: true } } },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { id: true, name: true } } },
      },
      evidence: {
        orderBy: { createdAt: "asc" },
        include: { uploadedBy: { select: { id: true, name: true, isPlatformAdmin: true } } },
      },
      sanctions: {
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true } }, appeals: true },
      },
      appeals: {
        orderBy: { submittedAt: "desc" },
        include: {
          appellant: { select: { name: true, email: true } },
          sanction: { select: { type: true, reason: true } },
        },
      },
    },
  });
}
