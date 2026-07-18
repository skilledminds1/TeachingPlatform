import { db } from "@/lib/db";
import { requireAuth } from "@/server/auth/session";
import { hasFeature } from "@/server/billing/entitlements";

export async function getConversationsForUser() {
  const user = await requireAuth();
  const conversations = await db.conversation.findMany({
    where: { OR: [{ teacherId: user.id }, { studentId: user.id }] },
    orderBy: { lastMessageAt: "desc" },
    include: {
      teacher: { select: { id: true, name: true, avatarUrl: true } },
      student: { select: { id: true, name: true, avatarUrl: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, body: true, createdAt: true, senderId: true, readAt: true },
      },
    },
  });

  return {
    user,
    conversations: conversations.map((conversation) => {
      const other =
        conversation.teacherId === user.id ? conversation.student : conversation.teacher;
      const latest = conversation.messages[0] ?? null;
      const unread =
        latest && latest.senderId !== user.id && !latest.readAt ? 1 : 0;
      return {
        id: conversation.id,
        other,
        latest,
        unread,
        lastMessageAt: conversation.lastMessageAt,
      };
    }),
  };
}

export async function getConversationThread(conversationId: string) {
  const user = await requireAuth();
  const conversation = await db.conversation.findFirst({
    where: {
      id: conversationId,
      OR: [{ teacherId: user.id }, { studentId: user.id }],
    },
    include: {
      teacher: { select: { id: true, name: true, avatarUrl: true } },
      student: { select: { id: true, name: true, avatarUrl: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        take: 200,
        include: { sender: { select: { id: true, name: true } } },
      },
    },
  });
  if (!conversation) return null;

  await db.message.updateMany({
    where: {
      conversationId: conversation.id,
      senderId: { not: user.id },
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  return {
    user,
    conversation,
    other:
      conversation.teacherId === user.id ? conversation.student : conversation.teacher,
  };
}

export async function assertCanMessageTeacher(teacherUserId: string) {
  const profile = await db.teacherProfile.findUnique({
    where: { userId: teacherUserId },
    select: { organizationId: true, status: true },
  });
  if (!profile || profile.status !== "approved") {
    return { allowed: false as const, reason: "Teacher is not available for messaging." };
  }
  if (!(await hasFeature(profile.organizationId, "direct_messaging"))) {
    return { allowed: false as const, reason: "Messaging is not enabled for this teacher." };
  }

  return { allowed: true as const, organizationId: profile.organizationId };
}
