import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/server/auth/session";

export async function getAdminMessagingData() {
  const admin = await requirePlatformAdmin();
  const [users, conversations] = await Promise.all([
    db.user.findMany({
      where: {
        deletedAt: null,
        isPlatformAdmin: false,
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        teacherProfile: { select: { status: true } },
        memberships: { select: { role: true }, take: 1 },
      },
    }),
    db.conversation.findMany({
      where: { teacherId: admin.id },
      orderBy: { lastMessageAt: "desc" },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            teacherProfile: { select: { status: true } },
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            body: true,
            createdAt: true,
            senderId: true,
            readAt: true,
          },
        },
      },
    }),
  ]);

  return { admin, users, conversations };
}

export async function getAdminMessageThread(conversationId: string) {
  const admin = await requirePlatformAdmin();
  const conversation = await db.conversation.findFirst({
    where: {
      id: conversationId,
      teacherId: admin.id,
    },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
          teacherProfile: { select: { status: true } },
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        take: 200,
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              isPlatformAdmin: true,
            },
          },
        },
      },
    },
  });
  if (!conversation) return null;

  await db.message.updateMany({
    where: {
      conversationId,
      senderId: { not: admin.id },
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  return { admin, conversation };
}
