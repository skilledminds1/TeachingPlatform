"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { routeLessonProviders } from "@/lib/payments/routing";
import { requireAuth } from "@/server/auth/session";
import { paymentWindowExpiry } from "@/server/payments/confirm";
import { buildPayfastLessonCheckout } from "@/services/payfast/lessons";
import { createPayPalOrder } from "@/services/paypal/checkout";
import { fail, ok, type ActionResult } from "@/types/action";

const startCheckoutSchema = z.object({
  bookingId: z.uuid(),
  provider: z.enum(["payfast", "paypal"]),
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
              provider: { in: ["payfast", "paypal"] },
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
    if (parsed.data.provider === "payfast") {
      if (booking.currency !== "ZAR") {
        return fail("PayFast lesson checkout requires ZAR.", "VALIDATION_ERROR");
      }
      const checkout = buildPayfastLessonCheckout({
        attemptId: attempt.id,
        bookingId: booking.id,
        amountCents: booking.hourlyRateCents,
        teacherMerchantId: merchant.providerAccountId,
        itemName: `Lesson with ${booking.teacher.name}`,
        studentEmail: booking.student.email,
        studentName: booking.student.name,
      });
      await db.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "requires_action",
          checkoutUrl: checkout.url,
          providerCheckoutId: attempt.id,
          metadata: { fields: checkout.fields },
        },
      });
      revalidatePath(`/dashboard/bookings/${booking.id}`);
      return ok({ url: checkout.url, method: "post", fields: checkout.fields });
    }

    const order = await createPayPalOrder({
      attemptId: attempt.id,
      bookingId: booking.id,
      amountCents: booking.hourlyRateCents,
      currency: booking.currency,
      teacherMerchantId: merchant.providerAccountId,
      description: `Lesson with ${booking.teacher.name}`,
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
