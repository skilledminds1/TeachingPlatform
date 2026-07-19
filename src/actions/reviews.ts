"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { submitReviewSchema } from "@/lib/validations/reviews";
import { requireAuth } from "@/server/auth/session";
import { hasFeature } from "@/server/billing/entitlements";
import { fail, ok, type ActionResult } from "@/types/action";

export async function submitReview(
  input: unknown,
): Promise<ActionResult<{ reviewId: string }>> {
  const parsed = submitReviewSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid review.", "VALIDATION_ERROR");
  }
  const student = await requireAuth();
  const booking = await db.booking.findUnique({
    where: { id: parsed.data.bookingId },
    select: {
      id: true,
      studentId: true,
      teacherId: true,
      organizationId: true,
      status: true,
      review: { select: { id: true } },
      teacher: { select: { teacherProfile: { select: { slug: true } } } },
    },
  });
  if (!booking) return fail("Booking not found.", "NOT_FOUND");
  if (booking.studentId !== student.id) {
    return fail("Only the student can review this lesson.", "FORBIDDEN");
  }
  if (booking.status !== "completed") {
    return fail("Reviews are available after a completed lesson.", "CONFLICT");
  }
  if (booking.review) return fail("You have already reviewed this lesson.", "CONFLICT");
  if (!(await hasFeature(booking.organizationId, "reviews"))) {
    return fail("Reviews are not enabled for this teacher's plan.", "PLAN_LIMIT_EXCEEDED");
  }

  const review = await db.review.create({
    data: {
      bookingId: booking.id,
      studentId: student.id,
      teacherId: booking.teacherId,
      rating: parsed.data.rating,
      comment: parsed.data.comment,
      status: "pending",
    },
  });
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/bookings/${booking.id}`);
  if (booking.teacher.teacherProfile?.slug) {
    revalidatePath(`/find-tutor/${booking.teacher.teacherProfile.slug}`);
  }
  return ok({ reviewId: review.id });
}
