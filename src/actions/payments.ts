"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { routeLessonProviders } from "@/lib/payments/routing";
import { requireAuth } from "@/server/auth/session";
import { paymentWindowExpiry } from "@/server/payments/confirm";
import { createPayPalOrder } from "@/services/paypal/checkout";
import { fail, ok, type ActionResult } from "@/types/action";

const startCheckoutSchema = z.object({
  bookingId: z.uuid(),
  provider: z.enum(["paypal"]),
});

const startCourseCheckoutSchema = z.object({
  courseId: z.uuid(),
});

export async function startLessonCheckout(
  input: unknown,
): Promise<ActionResult<{ url: string; method: "redirect" | "post"; fields?: Record<string, string> }>> {
  const parsed = startCheckoutSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid checkout request.", "VALIDATION_ERROR");
  }

  const user = await requireAuth();
  const booking = await db.booking.findUnique({
    where: { id: parsed.data.bookingId },
    include: {
      teacher: {
        select: {
          id: true,
          name: true,
          email: true,
          teacherPaymentAccounts: {
            where: {
              isActive: true,
              onboardingStatus: "complete",
              provider: "paypal",
            },
            select: {
              provider: true,
              providerAccountId: true,
              settlementCurrency: true,
            },
          },
        },
      },
      student: { select: { id: true, email: true, name: true } },
    },
  });

  if (!booking) return fail("Booking not found.", "NOT_FOUND");
  if (booking.studentId !== user.id) {
    return fail("Only the student can pay for this lesson.", "FORBIDDEN");
  }
  if (booking.status !== "pending_payment") {
    return fail("This booking is not awaiting payment.", "CONFLICT");
  }
  if (booking.paymentExpiresAt && booking.paymentExpiresAt.getTime() < Date.now()) {
    return fail("The payment window for this booking has expired.", "CONFLICT");
  }

  const linked = booking.teacher.teacherPaymentAccounts.map((account) => account.provider);
  const available = routeLessonProviders({
    currency: booking.currency,
    linkedProviders: linked,
  });
  if (!available.includes(parsed.data.provider)) {
    return fail(
      "That payment method is not available for this teacher and currency.",
      "VALIDATION_ERROR",
    );
  }

  const merchant = booking.teacher.teacherPaymentAccounts.find(
    (account) => account.provider === parsed.data.provider,
  );
  if (!merchant) {
    return fail("Teacher payment account is missing.", "VALIDATION_ERROR");
  }

  const expiresAt = booking.paymentExpiresAt ?? paymentWindowExpiry();
  const idempotencyKey = `${booking.id}:${parsed.data.provider}:${Math.floor(Date.now() / 60_000)}`;

  const attempt = await db.paymentAttempt.create({
    data: {
      id: randomUUID(),
      bookingId: booking.id,
      provider: parsed.data.provider,
      status: "pending",
      amountCents: booking.hourlyRateCents,
      currency: booking.currency,
      teacherMerchantId: merchant.providerAccountId,
      expiresAt,
      idempotencyKey,
    },
  });

  try {
    const order = await createPayPalOrder({
      attemptId: attempt.id,
      amountCents: booking.hourlyRateCents,
      currency: booking.currency,
      teacherMerchantId: merchant.providerAccountId,
      description: `Lesson with ${booking.teacher.name}`,
      target: { type: "booking", id: booking.id },
    });
    await db.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "requires_action",
        providerCheckoutId: order.orderId,
        checkoutUrl: order.approveUrl,
      },
    });
    revalidatePath(`/dashboard/bookings/${booking.id}`);
    return ok({ url: order.approveUrl, method: "redirect" });
  } catch (error) {
    await db.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "failed",
        failureMessage: error instanceof Error ? error.message : "Checkout failed",
      },
    });
    return fail(
      error instanceof Error ? error.message : "Unable to start checkout.",
      "INTERNAL_ERROR",
    );
  }
}

export async function startCourseCheckout(
  input: unknown,
): Promise<ActionResult<{ url: string; method: "redirect" }>> {
  const parsed = startCourseCheckoutSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid checkout request.", "VALIDATION_ERROR");
  }

  const user = await requireAuth();
  const course = await db.course.findFirst({
    where: {
      id: parsed.data.courseId,
      status: "published",
      deletedAt: null,
    },
    select: {
      id: true,
      title: true,
      teacherId: true,
      priceCents: true,
      currency: true,
      enrollments: {
        where: { studentId: user.id, revokedAt: null },
        select: { id: true },
        take: 1,
      },
      teacher: {
        select: {
          teacherPaymentAccounts: {
            where: {
              isActive: true,
              onboardingStatus: "complete",
              provider: "paypal",
            },
            select: { providerAccountId: true },
            take: 1,
          },
        },
      },
    },
  });

  if (!course) return fail("Course not found.", "NOT_FOUND");
  if (course.teacherId === user.id) {
    return fail("You cannot purchase your own course.", "FORBIDDEN");
  }
  if (course.enrollments.length > 0) {
    return fail("You are already enrolled in this course.", "CONFLICT");
  }

  const merchant = course.teacher.teacherPaymentAccounts[0];
  if (!merchant) {
    return fail("This teacher has not connected PayPal yet.", "VALIDATION_ERROR");
  }

  const expiresAt = paymentWindowExpiry();
  const { purchase, attempt } = await db.$transaction(async (tx) => {
    const createdPurchase = await tx.coursePurchase.create({
      data: {
        courseId: course.id,
        studentId: user.id,
        teacherId: course.teacherId,
        amountCents: course.priceCents,
        currency: course.currency,
        status: "pending",
        paymentExpiresAt: expiresAt,
      },
      select: { id: true },
    });
    const createdAttempt = await tx.paymentAttempt.create({
      data: {
        id: randomUUID(),
        coursePurchaseId: createdPurchase.id,
        provider: "paypal",
        status: "pending",
        amountCents: course.priceCents,
        currency: course.currency,
        teacherMerchantId: merchant.providerAccountId,
        expiresAt,
        idempotencyKey: `${createdPurchase.id}:paypal`,
        metadata: { kind: "course" },
      },
      select: { id: true },
    });
    return { purchase: createdPurchase, attempt: createdAttempt };
  });

  try {
    const order = await createPayPalOrder({
      attemptId: attempt.id,
      amountCents: course.priceCents,
      currency: course.currency,
      teacherMerchantId: merchant.providerAccountId,
      description: course.title,
      target: { type: "course", id: purchase.id },
    });
    await db.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "requires_action",
        providerCheckoutId: order.orderId,
        checkoutUrl: order.approveUrl,
      },
    });
    revalidatePath(`/dashboard/courses/purchases/${purchase.id}`);
    return ok({ url: order.approveUrl, method: "redirect" });
  } catch (error) {
    await db.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "failed",
        failureMessage: error instanceof Error ? error.message : "Checkout failed",
      },
    });
    return fail(
      error instanceof Error ? error.message : "Unable to start checkout.",
      "INTERNAL_ERROR",
    );
  }
}
