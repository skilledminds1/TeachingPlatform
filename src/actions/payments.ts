"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { logger } from "@/lib/observability/logger";
import { routeLessonProviders } from "@/lib/payments/routing";
import { requireAuth } from "@/server/auth/session";
import { getOrganizationGrowthWriteBlock } from "@/server/billing/write-gate";
import { paymentWindowExpiry } from "@/server/payments/confirm";
import { resolveCoursePrice } from "@/server/courses/pricing";
import { enforceActionRateLimit } from "@/server/security/action-rate-limit";
import { getScopeRestriction, usersHaveBlock } from "@/server/trust/enforcement";
import { createPayPalOrder } from "@/services/paypal/checkout";
import { fail, ok, type ActionResult } from "@/types/action";

/** Thrown inside the checkout transaction when a coupon's redemption limit is already met. */
class CouponUnavailableError extends Error {}

const startCheckoutSchema = z.object({
  bookingId: z.uuid(),
  provider: z.enum(["paypal"]),
});

const startCourseCheckoutSchema = z.object({
  courseId: z.uuid(),
  couponCode: z.string().trim().max(32).optional(),
});

export async function startLessonCheckout(
  input: unknown,
): Promise<ActionResult<{ url: string; method: "redirect" | "post"; fields?: Record<string, string> }>> {
  const parsed = startCheckoutSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid checkout request.", "VALIDATION_ERROR");
  }

  const user = await requireAuth();
  const limited = await enforceActionRateLimit({
    action: "payment-checkout",
    limit: 10,
    windowMs: 10 * 60_000,
    userId: user.id,
  });
  if (limited) return limited;
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
    logger.error("lesson_checkout_failed", { error, attemptId: attempt.id, bookingId: booking.id });
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
  const limited = await enforceActionRateLimit({
    action: "course-checkout",
    limit: 10,
    windowMs: 10 * 60_000,
    userId: user.id,
  });
  if (limited) return limited;
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
      organizationId: true,
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
  const billingBlock = await getOrganizationGrowthWriteBlock(course.organizationId);
  if (billingBlock) return fail(billingBlock, "FORBIDDEN");
  if (await usersHaveBlock(user.id, course.teacherId)) {
    return fail("You cannot start a new purchase with this user.", "FORBIDDEN");
  }
  const sellingRestriction = await getScopeRestriction(course.teacherId, "selling");
  if (sellingRestriction) return fail("This course is not currently available for purchase.", "FORBIDDEN");
  if (course.enrollments.length > 0) {
    return fail("You are already enrolled in this course.", "CONFLICT");
  }
  const price = await resolveCoursePrice({
    courseId: course.id,
    teacherId: course.teacherId,
    listAmountCents: course.priceCents,
    couponCode: parsed.data.couponCode,
    studentId: user.id,
  });
  if (parsed.data.couponCode && price.couponError) {
    return fail(price.couponError, "VALIDATION_ERROR");
  }

  if (price.amountCents === 0) {
    try {
      await db.$transaction(async (tx) => {
        const purchase = await tx.coursePurchase.create({
          data: {
            courseId: course.id,
            studentId: user.id,
            teacherId: course.teacherId,
            amountCents: price.amountCents,
            listAmountCents: price.listAmountCents,
            discountCents: price.discountCents,
            discountSource: price.discountSource,
            courseSaleId: price.saleId,
            courseCouponId: price.couponId,
            currency: course.currency,
            status: "succeeded",
            paymentProvider: null,
            paymentExternalId: null,
            paymentExpiresAt: null,
          },
          select: { id: true },
        });

        await tx.courseEnrollment.create({
          data: {
            courseId: course.id,
            studentId: user.id,
            purchaseId: purchase.id,
          },
        });
        if (price.couponId) {
          await tx.courseCouponRedemption.create({
            data: { couponId: price.couponId, purchaseId: purchase.id, studentId: user.id },
          });
        }
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        return fail("You are already enrolled in this course.", "CONFLICT");
      }
      throw error;
    }

    revalidatePath("/courses");
    revalidatePath("/dashboard/courses");
    revalidatePath(`/dashboard/courses/${course.id}`);
    return ok({ url: `/dashboard/courses/${course.id}`, method: "redirect" });
  }

  const merchant = course.teacher.teacherPaymentAccounts[0];
  if (!merchant) {
    return fail("This teacher has not connected PayPal yet.", "VALIDATION_ERROR");
  }

  const expiresAt = paymentWindowExpiry();
  const created = await db
    .$transaction(async (tx) => {
    const createdPurchase = await tx.coursePurchase.create({
      data: {
        courseId: course.id,
        studentId: user.id,
        teacherId: course.teacherId,
        amountCents: price.amountCents,
        listAmountCents: price.listAmountCents,
        discountCents: price.discountCents,
        discountSource: price.discountSource,
        courseSaleId: price.saleId,
        courseCouponId: price.couponId,
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
        amountCents: price.amountCents,
        currency: course.currency,
        teacherMerchantId: merchant.providerAccountId,
        expiresAt,
        idempotencyKey: `${createdPurchase.id}:paypal`,
        metadata: { kind: "course" },
      },
      select: { id: true },
    });

    // MON-26: reserve the coupon slot now, not at confirmation. The redemption row used to
    // be written only after payment succeeded, so `_count.redemptions` never saw in-flight
    // checkouts and a limited coupon could be over-redeemed by however many students were
    // mid-checkout. Reserving here also makes the existing cleanup live: the failure path
    // below and expireAbandonedPayments both delete redemptions by purchaseId, which
    // previously could never match a row for a paid purchase.
    if (price.couponId) {
      const coupon = await tx.courseCoupon.findUnique({
        where: { id: price.couponId },
        select: { maxRedemptions: true, _count: { select: { redemptions: true } } },
      });
      if (
        coupon?.maxRedemptions !== null &&
        coupon !== null &&
        coupon._count.redemptions >= coupon.maxRedemptions
      ) {
        throw new CouponUnavailableError();
      }
      await tx.courseCouponRedemption.create({
        data: {
          couponId: price.couponId,
          purchaseId: createdPurchase.id,
          studentId: user.id,
        },
      });
    }

      return { purchase: createdPurchase, attempt: createdAttempt };
    })
    .catch((error: unknown) => {
      // The coupon's last slot was taken by a concurrent checkout, or this student already
      // holds a redemption (the [couponId, studentId] unique constraint). Either way the
      // discount is no longer available and no money has moved yet.
      if (
        error instanceof CouponUnavailableError ||
        (typeof error === "object" &&
          error &&
          "code" in error &&
          (error as { code?: string }).code === "P2002")
      ) {
        return null;
      }
      throw error;
    });

  if (!created) {
    return fail(
      "That coupon has just reached its redemption limit. Try again without it.",
      "CONFLICT",
    );
  }
  const { purchase, attempt } = created;

  try {
    const order = await createPayPalOrder({
      attemptId: attempt.id,
      amountCents: price.amountCents,
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
    logger.error("course_checkout_failed", { error, attemptId: attempt.id, purchaseId: purchase.id });
    await db.$transaction(async (tx) => {
      await tx.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "failed",
          failureMessage: error instanceof Error ? error.message : "Checkout failed",
        },
      });
      await tx.coursePurchase.update({
        where: { id: purchase.id },
        data: { status: "cancelled", paymentExpiresAt: null },
      });
      await tx.courseCouponRedemption.deleteMany({
        where: { purchaseId: purchase.id },
      });
    });
    return fail(
      error instanceof Error ? error.message : "Unable to start checkout.",
      "INTERNAL_ERROR",
    );
  }
}
