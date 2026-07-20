import type { CourseCoupon, CourseDiscountType, CourseSale } from "@prisma/client";

import { db } from "@/lib/db";
import { calculateCoursePrice, type CoursePrice, type Discount } from "./quality";

type DiscountRecord = Pick<CourseSale | CourseCoupon, "id" | "discountType" | "discountValue">;

function asDiscount(record: DiscountRecord | null): Discount | null {
  return record
    ? { id: record.id, type: record.discountType, value: record.discountValue }
    : null;
}

export async function resolveCoursePrice(input: {
  courseId: string;
  teacherId: string;
  listAmountCents: number;
  couponCode?: string | null;
  studentId?: string;
  now?: Date;
}): Promise<CoursePrice & { couponError: string | null }> {
  const now = input.now ?? new Date();
  const sales = await db.courseSale.findMany({
    where: {
      teacherId: input.teacherId,
      active: true,
      startsAt: { lte: now },
      endsAt: { gt: now },
      courses: { some: { courseId: input.courseId } },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, discountType: true, discountValue: true },
  });
  const sale =
    sales
      .map((candidate) => ({
        candidate,
        price: calculateCoursePrice(input.listAmountCents, asDiscount(candidate), null),
      }))
      .sort((a, b) => b.price.discountCents - a.price.discountCents)[0]?.candidate ?? null;

  let coupon: DiscountRecord | null = null;
  let couponError: string | null = null;
  const code = input.couponCode?.trim().toUpperCase();
  if (code) {
    const candidate = await db.courseCoupon.findFirst({
      where: { teacherId: input.teacherId, code },
      include: { _count: { select: { redemptions: true } } },
    });
    if (!candidate || !candidate.active) couponError = "Coupon is invalid or inactive.";
    else if (candidate.courseId && candidate.courseId !== input.courseId) {
      couponError = "Coupon does not apply to this course.";
    } else if (candidate.startsAt && candidate.startsAt > now) {
      couponError = "Coupon is not active yet.";
    } else if (candidate.endsAt && candidate.endsAt <= now) {
      couponError = "Coupon has expired.";
    } else if (
      candidate.maxRedemptions !== null &&
      candidate._count.redemptions >= candidate.maxRedemptions
    ) {
      couponError = "Coupon redemption limit has been reached.";
    } else if (
      input.studentId &&
      (await db.courseCouponRedemption.findUnique({
        where: { couponId_studentId: { couponId: candidate.id, studentId: input.studentId } },
        select: { id: true },
      }))
    ) {
      couponError = "You have already used this coupon.";
    } else {
      coupon = candidate;
    }
  }

  return {
    ...calculateCoursePrice(input.listAmountCents, asDiscount(sale), asDiscount(coupon)),
    couponError,
  };
}

export function validateDiscount(type: CourseDiscountType, value: number): string | null {
  if (!Number.isInteger(value) || value <= 0) return "Discount must be greater than zero.";
  if (type === "percent" && value > 100) return "Percent discounts cannot exceed 100%.";
  return null;
}
