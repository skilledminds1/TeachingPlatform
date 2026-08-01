"use server";

import { z } from "zod";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { sendMessageSchema } from "@/lib/validations/messaging";
import { hasTeacherMembership, requireAuth } from "@/server/auth/session";
import { assertCanMessageTeacher } from "@/server/messaging/conversations";
import { notifyNewMessage } from "@/server/notifications/notify";
import { enforceActionRateLimit } from "@/server/security/action-rate-limit";
import { getScopeRestriction, usersHaveBlock } from "@/server/trust/enforcement";
import { fail, ok, type ActionResult } from "@/types/action";

export async function sendMessage(
  input: unknown,
): Promise<ActionResult<{ conversationId: string; messageId: string }>> {
  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid message.", "VALIDATION_ERROR");
  }
  const user = await requireAuth();
  const limited = await enforceActionRateLimit({
    action: "message-send",
    limit: 30,
    windowMs: 60_000,
    userId: user.id,
  });
  if (limited) return limited;
  const restriction = await getScopeRestriction(user.id, "messaging");
  if (restriction) return fail(restriction, "FORBIDDEN");

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
    if (await usersHaveBlock(user.id, parsed.data.teacherUserId)) {
      return fail("You cannot start a conversation with this user.", "FORBIDDEN");
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

  const platformOwner = await db.user.findUnique({
    where: { id: conversation.teacherId },
    select: { isPlatformAdmin: true },
  });
  const isPlatformConversation = platformOwner?.isPlatformAdmin === true;

  if (isStudent && !isPlatformConversation) {
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
    href: isPlatformConversation && recipientId === conversation.teacherId
      ? `/admin/messages/${conversation.id}`
      : undefined,
  });

  revalidatePath("/dashboard/messages");
  revalidatePath(`/dashboard/messages/${conversation.id}`);
  revalidatePath("/dashboard/notifications");
  revalidatePath("/admin/messages");
  revalidatePath(`/admin/messages/${conversation.id}`);
  return ok({ conversationId: conversation.id, messageId: message.id });
}

export async function startConversationWithTeacher(
  teacherUserId: string,
): Promise<ActionResult<{ conversationId: string }>> {
  const user = await requireAuth();
  // SEC-14: validate before the id reaches Prisma, so a malformed value returns a clean
  // validation error instead of an opaque 500 from a P2023.
  if (!z.uuid().safeParse(teacherUserId).success) {
    return fail("Invalid teacher.", "VALIDATION_ERROR");
  }
  const restriction = await getScopeRestriction(user.id, "messaging");
  if (restriction) return fail(restriction, "FORBIDDEN");
  if (teacherUserId === user.id) {
    return fail("You cannot message yourself.", "VALIDATION_ERROR");
  }
  if (hasTeacherMembership(user)) {
    return fail("Teacher accounts cannot start student enquiries.", "FORBIDDEN");
  }
  if (await usersHaveBlock(user.id, teacherUserId)) {
    return fail("You cannot start a conversation with this user.", "FORBIDDEN");
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

export async function startConversationWithStudent(
  studentUserId: string,
): Promise<ActionResult<{ conversationId: string }>> {
  const teacher = await requireAuth();
  if (!z.uuid().safeParse(studentUserId).success) {
    return fail("Invalid student.", "VALIDATION_ERROR");
  }
  const restriction = await getScopeRestriction(teacher.id, "messaging");
  if (restriction) return fail(restriction, "FORBIDDEN");
  if (!hasTeacherMembership(teacher)) {
    return fail("Only teachers can message students this way.", "FORBIDDEN");
  }
  if (studentUserId === teacher.id) {
    return fail("You cannot message yourself.", "VALIDATION_ERROR");
  }
  if (await usersHaveBlock(teacher.id, studentUserId)) {
    return fail("You cannot start a conversation with this user.", "FORBIDDEN");
  }

  const allowed = await db.studentRelationship.findFirst({
    where: {
      teacherId: teacher.id,
      studentId: studentUserId,
      status: "active",
    },
    select: { id: true },
  });
  const sharedBooking = allowed
    ? null
    : await db.booking.findFirst({
        where: {
          teacherId: teacher.id,
          studentId: studentUserId,
        },
        select: { id: true },
      });

  if (!allowed && !sharedBooking) {
    return fail("You can only message your students.", "FORBIDDEN");
  }

  const conversation = await db.conversation.upsert({
    where: {
      teacherId_studentId: { teacherId: teacher.id, studentId: studentUserId },
    },
    update: {},
    create: { teacherId: teacher.id, studentId: studentUserId },
  });
  return ok({ conversationId: conversation.id });
}
