import { z } from "zod";

export const sendMessageSchema = z.object({
  conversationId: z.uuid().optional(),
  teacherUserId: z.uuid().optional(),
  body: z.string().trim().min(1).max(2_000),
}).refine((value) => Boolean(value.conversationId || value.teacherUserId), {
  message: "Choose a conversation or teacher.",
});
