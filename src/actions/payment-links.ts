"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAuth, requireTeacher } from "@/server/auth/session";
import { enforceActionRateLimit } from "@/server/security/action-rate-limit";
import {
  clearTeacherPaymentLink,
  confirmTeacherPaymentLinkChange,
  saveTeacherPaymentLink,
} from "@/server/teachers/payment-links";
import { fail, ok, type ActionResult } from "@/types/action";

const linkSchema = z.object({ url: z.string().trim().min(8).max(500) });
const reportSchema = z.object({
  bookingId: z.uuid(),
  reference: z.string().trim().max(120).optional(),
});

export async function saveMyPaymentLink(
  input: unknown,
): Promise<ActionResult<{ status: "saved" | "confirmation_sent" | "unchanged"; host?: string }>> {
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return fail("Paste your payment link.", "VALIDATION_ERROR");

  const teacher = await requireTeacher();
  const limited = await enforceActionRateLimit({
    action: "payment-link-save",
    limit: 10,
    windowMs: 60 * 60_000,
    userId: teacher.id,
  });
  if (limited) return limited;

  const result = await saveTeacherPaymentLink({
    userId: teacher.id,
    email: teacher.email,
    url: parsed.data.url,
  });
  if (result.status === "rejected") return fail(result.message, "VALIDATION_ERROR");

  revalidatePath("/dashboard/teacher/payments");
  return ok(
    result.status === "unchanged"
      ? { status: "unchanged" }
      : { status: result.status, host: result.link.host },
  );
}

export async function confirmMyPaymentLinkChange(
  token: unknown,
): Promise<ActionResult<{ host: string }>> {
  const parsed = z.string().trim().min(20).max(200).safeParse(token);
  if (!parsed.success) return fail("This confirmation link is not valid.", "VALIDATION_ERROR");

  await requireTeacher();
  const result = await confirmTeacherPaymentLinkChange(parsed.data);
  if (!result.confirmed) {
    return fail(
      result.reason === "expired"
        ? "That confirmation link has expired. Save the new link again."
        : "That confirmation link has already been used or replaced.",
      "CONFLICT",
    );
  }
  revalidatePath("/dashboard/teacher/payments");
  return ok({ host: result.host });
}

export async function removeMyPaymentLink(): Promise<ActionResult<{ removed: true }>> {
  const teacher = await requireTeacher();
  await clearTeacherPaymentLink(teacher.id);
  revalidatePath("/dashboard/teacher/payments");
  return ok({ removed: true });
}

/**
 * The teacher records that a student's payment arrived.
 *
 * Teacher-only and idempotent. It unlocks nothing — the lesson is already confirmed by
 * acceptance — so this exists to give both parties a shared record and to stop "did you pay?"
 * being an argument conducted from memory. The student is deliberately NOT able to write it:
 * a student marking their own payment received would be a claim about someone else's bank
 * account, and the person who can actually see the money is the teacher.
 */
export async function reportLessonPaymentReceived(
  input: unknown,
): Promise<ActionResult<{ reported: true }>> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid booking.", "VALIDATION_ERROR");

  const user = await requireAuth();
  const booking = await db.booking.findUnique({
    where: { id: parsed.data.bookingId },
    select: { id: true, teacherId: true, paymentReportedAt: true },
  });
  if (!booking) return fail("Booking not found.", "NOT_FOUND");
  if (booking.teacherId !== user.id) {
    return fail("Only the teacher can record that a payment arrived.", "FORBIDDEN");
  }
  if (booking.paymentReportedAt) return ok({ reported: true });

  await db.booking.updateMany({
    where: { id: booking.id, paymentReportedAt: null },
    data: {
      paymentReportedAt: new Date(),
      paymentReportedBy: user.id,
      paymentReference: parsed.data.reference ?? null,
    },
  });
  revalidatePath(`/dashboard/bookings/${booking.id}`);
  return ok({ reported: true });
}
