"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { isBookingRefundPolicyEligible } from "@/lib/refunds/policy";
import { requireAuth, requireTeacher } from "@/server/auth/session";
import { notifyModerationCaseUpdated, notifyRefundUpdated } from "@/server/notifications/notify";
import { fail, ok, type ActionResult } from "@/types/action";

const reasonSchema = z.string().trim().min(20).max(2_000);

const targetSchema = z.object({
  targetId: z.uuid(),
  reason: reasonSchema,
});

const responseSchema = z.object({
  refundRequestId: z.uuid(),
  decision: z.enum(["approve", "decline"]),
  response: z.string().trim().min(10).max(2_000),
});

const markRefundSchema = z.object({
  refundRequestId: z.uuid(),
  providerReference: z.string().trim().min(3).max(200),
});

const escalateSchema = z.object({
  refundRequestId: z.uuid(),
});

export async function requestBookingRefund(
  input: unknown,
): Promise<ActionResult<{ refundRequestId: string }>> {
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid refund request.", "VALIDATION_ERROR");
  }

  const student = await requireAuth();
  const booking = await db.booking.findFirst({
    where: {
      id: parsed.data.targetId,
      studentId: student.id,
      status: { in: ["confirmed", "cancelled", "completed", "no_show"] },
    },
    select: {
      id: true,
      studentId: true,
      teacherId: true,
      startsAt: true,
      currency: true,
      refundRequest: { select: { id: true } },
      paymentAttempts: {
        where: { status: { in: ["succeeded", "partially_refunded"] } },
        orderBy: { succeededAt: "desc" },
        take: 1,
        select: {
          id: true,
          amountCents: true,
          refundedCents: true,
        },
      },
    },
  });

  if (!booking) return fail("Paid lesson not found.", "NOT_FOUND");
  if (booking.refundRequest) {
    return fail("A refund request already exists for this lesson.", "CONFLICT");
  }
  const attempt = booking.paymentAttempts[0];
  if (!attempt || attempt.refundedCents >= attempt.amountCents) {
    return fail("This lesson has no refundable payment.", "CONFLICT");
  }

  const policyEligible = isBookingRefundPolicyEligible(booking.startsAt);
  const request = await db.refundRequest.create({
    data: {
      bookingId: booking.id,
      paymentAttemptId: attempt.id,
      studentId: booking.studentId,
      teacherId: booking.teacherId,
      requestedAmountCents: attempt.amountCents - attempt.refundedCents,
      currency: booking.currency,
      reason: parsed.data.reason,
      policyEligible,
    },
    select: { id: true },
  });

  revalidateRefundViews(booking.id);
  await notifyRefundUpdated(request.id).catch(() => undefined);
  return ok({ refundRequestId: request.id });
}

export async function respondToRefundRequest(
  input: unknown,
): Promise<ActionResult<{ updated: true }>> {
  const parsed = responseSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid response.", "VALIDATION_ERROR");
  }

  const teacher = await requireTeacher();
  const result = await db.refundRequest.updateMany({
    where: {
      id: parsed.data.refundRequestId,
      teacherId: teacher.id,
      status: { in: ["requested", "escalated"] },
    },
    data: {
      status: parsed.data.decision === "approve" ? "teacher_approved" : "teacher_declined",
      teacherResponse: parsed.data.response,
      respondedAt: new Date(),
    },
  });
  if (result.count === 0) {
    return fail("Refund request not found or already answered.", "CONFLICT");
  }

  revalidateRefundViews();
  await notifyRefundUpdated(parsed.data.refundRequestId).catch(() => undefined);
  return ok({ updated: true });
}

export async function markRefundSent(
  input: unknown,
): Promise<ActionResult<{ updated: true }>> {
  const parsed = markRefundSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid refund reference.", "VALIDATION_ERROR");
  }

  const teacher = await requireTeacher();
  const request = await db.refundRequest.findFirst({
    where: {
      id: parsed.data.refundRequestId,
      teacherId: teacher.id,
      status: "teacher_approved",
    },
    select: {
      id: true,
      requestedAmountCents: true,
      paymentAttemptId: true,
      paymentAttempt: { select: { id: true, amountCents: true, refundedCents: true } },
    },
  });
  if (!request) return fail("Approved refund request not found.", "NOT_FOUND");

  // MON-09: this used to update the RefundRequest row alone, leaving PaymentAttempt reading
  // as fully paid and unrefunded while the request read "refunded" — two ledgers that
  // permanently disagreed. Because the platform never holds funds, this manual path is the
  // EXPECTED route for most refunds, not an edge case.
  await db.$transaction(async (tx) => {
    await tx.refundRequest.update({
      where: { id: request.id },
      data: {
        status: "refunded",
        providerRefundId: parsed.data.providerReference,
        providerRefundedCents: request.requestedAmountCents,
        resolvedAt: new Date(),
      },
    });

    if (request.paymentAttempt) {
      const refundedCents = Math.min(
        request.paymentAttempt.amountCents,
        request.paymentAttempt.refundedCents + request.requestedAmountCents,
      );
      const fullyRefunded = refundedCents >= request.paymentAttempt.amountCents;
      await tx.paymentAttempt.update({
        where: { id: request.paymentAttempt.id },
        data: {
          refundedCents,
          status: fullyRefunded ? "refunded" : "partially_refunded",
        },
      });
    }
  });

  revalidateRefundViews();
  await notifyRefundUpdated(request.id).catch(() => undefined);
  return ok({ updated: true });
}

export async function escalateRefundRequest(
  input: unknown,
): Promise<ActionResult<{ updated: true; caseId: string }>> {
  const parsed = escalateSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Invalid refund request.", "VALIDATION_ERROR");
  }

  const student = await requireAuth();
  const result = await db.$transaction(async (tx) => {
    const request = await tx.refundRequest.findFirst({
      where: {
        id: parsed.data.refundRequestId,
        studentId: student.id,
        status: { in: ["requested", "teacher_declined", "escalated"] },
      },
      select: {
        id: true,
        studentId: true,
        teacherId: true,
        reason: true,
        moderationCaseId: true,
      },
    });
    if (!request) return null;

    let caseId = request.moderationCaseId;
    if (!caseId) {
      const moderationCase = await tx.moderationCase.create({
        data: {
          type: "refund",
          title: "Escalated refund mediation",
          summary: request.reason,
          reporterId: request.studentId,
          subjectId: request.teacherId,
          priority: "normal",
        },
        select: { id: true },
      });
      caseId = moderationCase.id;
    }
    await tx.refundRequest.update({
      where: { id: request.id },
      data: {
        status: "escalated",
        escalatedAt: new Date(),
        moderationCaseId: caseId,
      },
    });
    return { caseId };
  });
  if (!result) {
    return fail("Refund request cannot be escalated.", "CONFLICT");
  }

  revalidateRefundViews();
  revalidatePath(`/dashboard/cases/${result.caseId}`);
  revalidatePath("/admin/trust");
  await notifyRefundUpdated(parsed.data.refundRequestId).catch(() => undefined);
  await notifyModerationCaseUpdated(result.caseId, `escalated:${parsed.data.refundRequestId}`).catch(
    () => undefined,
  );
  return ok({ updated: true, caseId: result.caseId });
}

function revalidateRefundViews(bookingId?: string | null) {
  revalidatePath("/admin/payments");
  revalidatePath("/dashboard/refunds");
  revalidatePath("/dashboard/teacher/refunds");
  if (bookingId) revalidatePath(`/dashboard/bookings/${bookingId}`);
}
