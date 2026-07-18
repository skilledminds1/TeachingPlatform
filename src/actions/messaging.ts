"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { sendMessageSchema } from "@/lib/validations/messaging";
import { hasTeacherMembership, requireAuth } from "@/server/auth/session";
import { assertCanMessageTeacher } from "@/server/messaging/conversations";
import { notifyNewMessage } from "@/server/notifications/notify";
import { fail, ok, type ActionResult } from "@/types/action";

export async function sendMessage(
  input: unknown,
): Promise<ActionResult<{ conversationId: string; messageId: string }>> {
  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid message.", "VALIDATION_ERROR");
  }
  const user = await requireAuth();

  let conversation = parsed.data.conversationId
    ? await db.conversation.findFirst({
        where: {
          id: parsed.data.conversationId,
          OR: [{ teacherId: user.id }, { studentId: user.id }],
        },
      })
    : null;

  if (!conversation && parsed.data.teacherUserId) {
    if (parsed.data.teacherUserId === user.id) {
      return fail("You cannot message yourself.", "VALIDATION_ERROR");
    }
    if (hasTeacherMembership(user)) {
      return fail("Teacher accounts cannot start student enquiries.", "FORBIDDEN");
    }
    const allowed = await assertCanMessageTeacher(parsed.data.teacherUserId);
    if (!allowed.allowed) return fail(allowed.reason, "FORBIDDEN");

    conversation = await db.conversation.upsert({
      where: {
        teacherId_studentId: {
          teacherId: parsed.data.teacherUserId,
          studentId: user.id,
        },
      },
      update: {},
      create: {
        teacherId: parsed.data.teacherUserId,
        studentId: user.id,
      },
    });
  }

  if (!conversation) return fail("Conversation not found.", "NOT_FOUND");

  const isTeacher = conversation.teacherId === user.id;
  const isStudent = conversation.studentId === user.id;
  if (!isTeacher && !isStudent) return fail("You cannot message here.", "FORBIDDEN");

  if (isStudent) {
    const allowed = await assertCanMessageTeacher(conversation.teacherId);
    if (!allowed.allowed) return fail(allowed.reason, "FORBIDDEN");
  }

  const message = await db.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: {
        conversationId: conversation.id,
        senderId: user.id,
        body: parsed.data.body,
      },
    });
    await tx.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: created.createdAt },
    });
    return created;
  });

  const recipientId = isTeacher ? conversation.studentId : conversation.teacherId;
  await notifyNewMessage({
    recipientId,
    senderName: user.name,
    conversationId: conversation.id,
    preview: parsed.data.body,
  });

  revalidatePath("/dashboard/messages");
  revalidatePath(`/dashboard/messages/${conversation.id}`);
  revalidatePath("/dashboard/notifications");
  return ok({ conversationId: conversation.id, messageId: message.id });
}

export async function startConversationWithTeacher(
  teacherUserId: string,
): Promise<ActionResult<{ conversationId: string }>> {
  const user = await requireAuth();
  if (teacherUserId === user.id) {
    return fail("You cannot message yourself.", "VALIDATION_ERROR");
  }
  if (hasTeacherMembership(user)) {
    return fail("Teacher accounts cannot start student enquiries.", "FORBIDDEN");
  }
  const allowed = await assertCanMessageTeacher(teacherUserId);
  if (!allowed.allowed) return fail(allowed.reason, "FORBIDDEN");

  const conversation = await db.conversation.upsert({
    where: {
      teacherId_studentId: { teacherId: teacherUserId, studentId: user.id },
    },
    update: {},
    create: { teacherId: teacherUserId, studentId: user.id },
  });
  return ok({ conversationId: conversation.id });
}
