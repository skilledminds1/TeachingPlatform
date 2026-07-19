"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/server/auth/session";
import { notifyNewMessage } from "@/server/notifications/notify";
import { fail, ok, type ActionResult } from "@/types/action";

const adminMessageSchema = z
  .object({
    recipientId: z.uuid().optional(),
    conversationId: z.uuid().optional(),
    body: z.string().trim().min(1, "Write a message.").max(2_000),
  })
  .refine((value) => Boolean(value.recipientId || value.conversationId), {
    message: "Choose a recipient or conversation.",
  });

export async function sendAdminMessage(
  input: unknown,
): Promise<ActionResult<{ conversationId: string; messageId: string }>> {
  const parsed = adminMessageSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      parsed.error.issues[0]?.message ?? "Invalid message.",
      "VALIDATION_ERROR",
    );
  }

  const admin = await requirePlatformAdmin();
  let conversation = parsed.data.conversationId
    ? await db.conversation.findFirst({
        where: {
          id: parsed.data.conversationId,
          teacherId: admin.id,
        },
      })
    : null;

  if (!conversation && parsed.data.recipientId) {
    if (parsed.data.recipientId === admin.id) {
      return fail("You cannot message yourself.", "VALIDATION_ERROR");
    }
    const recipient = await db.user.findFirst({
      where: {
        id: parsed.data.recipientId,
        deletedAt: null,
        isPlatformAdmin: false,
      },
      select: { id: true },
    });
    if (!recipient) return fail("User not found.", "NOT_FOUND");

    conversation = await db.conversation.upsert({
      where: {
        teacherId_studentId: {
          teacherId: admin.id,
          studentId: recipient.id,
        },
      },
      update: {},
      create: {
        teacherId: admin.id,
        studentId: recipient.id,
      },
    });
  }

  if (!conversation) return fail("Conversation not found.", "NOT_FOUND");

  const message = await db.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: {
        conversationId: conversation.id,
        senderId: admin.id,
        body: parsed.data.body,
      },
    });
    await tx.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: created.createdAt },
    });
    await tx.adminAuditLog.create({
      data: {
        adminUserId: admin.id,
        action: "platform_message.sent",
        targetType: "User",
        targetId: conversation.studentId,
        metadata: {
          conversationId: conversation.id,
          messageId: created.id,
        },
      },
    });
    return created;
  });

  await notifyNewMessage({
    recipientId: conversation.studentId,
    senderName: "Platform Owner",
    conversationId: conversation.id,
    preview: parsed.data.body,
  });

  revalidatePath("/admin/messages");
  revalidatePath(`/admin/messages/${conversation.id}`);
  revalidatePath("/dashboard/messages");
  revalidatePath(`/dashboard/messages/${conversation.id}`);
  revalidatePath("/dashboard/notifications");

  return ok({ conversationId: conversation.id, messageId: message.id });
}
