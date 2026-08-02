"use server";

import { recomputeCourseAggregatesSafely } from "@/server/courses/aggregates";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAuth } from "@/server/auth/session";
import { getOrganizationGrowthWriteBlock } from "@/server/billing/write-gate";
import { canAnswerCourseQuestion, canReviewCourse } from "@/server/courses/quality";
import { validateDiscount } from "@/server/courses/pricing";
import { getScopeRestriction } from "@/server/trust/enforcement";
import { fail, ok, type ActionResult } from "@/types/action";

const reviewSchema = z.object({
  courseId: z.uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().min(10, "Write at least 10 characters.").max(2_000),
});
const textSchema = z.object({ id: z.uuid(), body: z.string().trim().min(2).max(2_000) });
const hideSchema = z.object({ questionId: z.uuid(), hidden: z.boolean() });
const promotionStateSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["sale", "coupon"]),
  active: z.boolean(),
});
const promotionSchema = z.object({
  courseId: z.uuid().optional(),
  name: z.string().trim().min(2).max(100),
  discountType: z.enum(["percent", "fixed"]),
  discountValue: z.coerce.number().int().positive(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  active: z.boolean().default(true),
});
const couponSchema = promotionSchema.extend({
  code: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9_-]+$/),
  maxRedemptions: z.coerce.number().int().positive().optional(),
});

function refreshCourse(courseId: string, slug?: string) {
  revalidatePath(`/dashboard/courses/${courseId}`);
  revalidatePath(`/dashboard/teacher/courses/${courseId}`);
  revalidatePath("/admin/reviews");
  revalidatePath("/courses");
  if (slug) revalidatePath(`/courses/${slug}`);
}

export async function submitCourseReview(
  input: unknown,
): Promise<ActionResult<{ submitted: true }>> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid review.");
  const user = await requireAuth();
  const restriction = await getScopeRestriction(user.id, "messaging");
  if (restriction) return fail(restriction, "FORBIDDEN");
  const enrollment = await db.courseEnrollment.findUnique({
    where: { courseId_studentId: { courseId: parsed.data.courseId, studentId: user.id } },
    select: {
      id: true,
      revokedAt: true,
      review: { select: { id: true } },
      course: { select: { teacherId: true, slug: true } },
    },
  });
  if (!enrollment) return fail("You must be enrolled to review this course.", "FORBIDDEN");
  if (enrollment.review) return fail("You already reviewed this course.", "CONFLICT");
  const completedLessonCount = await db.courseLessonProgress.count({
    where: {
      studentId: user.id,
      completedAt: { not: null },
      lesson: { module: { courseId: parsed.data.courseId } },
    },
  });
  const eligibility = canReviewCourse({
    enrollmentRevokedAt: enrollment.revokedAt,
    completedLessonCount,
  });
  if (!eligibility.eligible) return fail(eligibility.reason!, "FORBIDDEN");
  await db.courseReview.create({
    data: {
      enrollmentId: enrollment.id,
      courseId: parsed.data.courseId,
      studentId: user.id,
      teacherId: enrollment.course.teacherId,
      rating: parsed.data.rating,
      comment: parsed.data.comment,
    },
  });
  // QLT-07: keep the denormalised catalog aggregates in step with the reviews they mirror.
  await recomputeCourseAggregatesSafely(parsed.data.courseId);
  refreshCourse(parsed.data.courseId, enrollment.course.slug);
  return ok({ submitted: true });
}

export async function respondToCourseReview(
  input: unknown,
): Promise<ActionResult<{ responded: true }>> {
  const parsed = textSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid response.");
  const user = await requireAuth();
  const restriction = await getScopeRestriction(user.id, "messaging");
  if (restriction) return fail(restriction, "FORBIDDEN");
  const review = await db.courseReview.findUnique({
    where: { id: parsed.data.id },
    select: { id: true, teacherId: true, courseId: true, course: { select: { slug: true } } },
  });
  if (!review) return fail("Review not found.", "NOT_FOUND");
  if (review.teacherId !== user.id) return fail("Only the course teacher can respond.", "FORBIDDEN");
  await db.courseReview.update({
    where: { id: review.id },
    data: { teacherResponse: parsed.data.body },
  });
  refreshCourse(review.courseId, review.course.slug);
  return ok({ responded: true });
}

export async function askCourseQuestion(
  input: unknown,
): Promise<ActionResult<{ questionId: string }>> {
  const parsed = z
    .object({
      courseId: z.uuid(),
      body: z.string().trim().min(5).max(2_000),
      // QLT-10: consent to publish, defaulting to NO. It is a separate decision from asking,
      // and the person who bears the consequence has to be the one who makes it.
      isPublic: z.boolean().default(false),
    })
    .safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid question.");
  const user = await requireAuth();
  const restriction = await getScopeRestriction(user.id, "messaging");
  if (restriction) return fail(restriction, "FORBIDDEN");
  const enrollment = await db.courseEnrollment.findUnique({
    where: { courseId_studentId: { courseId: parsed.data.courseId, studentId: user.id } },
    select: { revokedAt: true },
  });
  if (!enrollment || enrollment.revokedAt) {
    return fail("An active enrollment is required to ask questions.", "FORBIDDEN");
  }
  const question = await db.courseQuestion.create({
    data: {
      courseId: parsed.data.courseId,
      studentId: user.id,
      body: parsed.data.body,
      isPublic: parsed.data.isPublic,
    },
    select: { id: true },
  });
  refreshCourse(parsed.data.courseId);
  return ok({ questionId: question.id });
}

export async function answerCourseQuestion(
  input: unknown,
): Promise<ActionResult<{ answered: true }>> {
  const parsed = textSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid answer.");
  const user = await requireAuth();
  const restriction = await getScopeRestriction(user.id, "messaging");
  if (restriction) return fail(restriction, "FORBIDDEN");
  const question = await db.courseQuestion.findUnique({
    where: { id: parsed.data.id },
    select: { id: true, courseId: true, course: { select: { teacherId: true } } },
  });
  if (!question) return fail("Question not found.", "NOT_FOUND");
  if (
    !canAnswerCourseQuestion({
      isCourseTeacher: question.course.teacherId === user.id,
      isRestricted: Boolean(restriction),
    })
  ) {
    return fail("Only the course teacher can answer.", "FORBIDDEN");
  }
  await db.courseAnswer.upsert({
    where: { questionId: question.id },
    create: { questionId: question.id, teacherId: user.id, body: parsed.data.body },
    update: { body: parsed.data.body, teacherId: user.id },
  });
  refreshCourse(question.courseId);
  return ok({ answered: true });
}

export async function setCourseQuestionHidden(
  input: unknown,
): Promise<ActionResult<{ hidden: boolean }>> {
  const parsed = hideSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid question.");
  const user = await requireAuth();
  const question = await db.courseQuestion.findUnique({
    where: { id: parsed.data.questionId },
    select: {
      courseId: true,
      course: { select: { teacherId: true, organizationId: true } },
    },
  });
  if (!question) return fail("Question not found.", "NOT_FOUND");
  if (question.course.teacherId !== user.id && !user.isPlatformAdmin) {
    return fail("You cannot moderate this question.", "FORBIDDEN");
  }
  if (!user.isPlatformAdmin) {
    const restriction = await getScopeRestriction(user.id, "messaging");
    if (restriction) return fail(restriction, "FORBIDDEN");
    const billingBlock = await getOrganizationGrowthWriteBlock(question.course.organizationId);
    if (billingBlock) return fail(billingBlock, "FORBIDDEN");
  }
  await db.courseQuestion.update({
    where: { id: parsed.data.questionId },
    data: { hidden: parsed.data.hidden },
  });
  refreshCourse(question.courseId);
  return ok({ hidden: parsed.data.hidden });
}

export async function createCourseSale(
  input: unknown,
): Promise<ActionResult<{ saleId: string }>> {
  const parsed = promotionSchema.required({ courseId: true, startsAt: true, endsAt: true }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid sale.");
  const user = await requireAuth();
  const restriction = await getScopeRestriction(user.id, "selling");
  if (restriction) return fail(restriction, "FORBIDDEN");
  const course = await db.course.findFirst({
    where: { id: parsed.data.courseId, teacherId: user.id, deletedAt: null },
    select: { id: true, organizationId: true },
  });
  if (!course) return fail("Course not found.", "NOT_FOUND");
  const billingBlock = await getOrganizationGrowthWriteBlock(course.organizationId);
  if (billingBlock) return fail(billingBlock, "FORBIDDEN");
  const discountError = validateDiscount(parsed.data.discountType, parsed.data.discountValue);
  if (discountError) return fail(discountError);
  if (parsed.data.endsAt <= parsed.data.startsAt) return fail("Sale end must be after its start.");
  const sale = await db.courseSale.create({
    data: {
      teacherId: user.id,
      name: parsed.data.name,
      discountType: parsed.data.discountType,
      discountValue: parsed.data.discountValue,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      active: parsed.data.active,
      courses: { create: { courseId: course.id } },
    },
    select: { id: true },
  });
  refreshCourse(course.id);
  return ok({ saleId: sale.id });
}

export async function createCourseCoupon(
  input: unknown,
): Promise<ActionResult<{ couponId: string }>> {
  const parsed = couponSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid coupon.");
  const user = await requireAuth();
  const restriction = await getScopeRestriction(user.id, "selling");
  if (restriction) return fail(restriction, "FORBIDDEN");
  let organizationId: string | null = null;
  if (parsed.data.courseId) {
    const course = await db.course.findFirst({
      where: { id: parsed.data.courseId, teacherId: user.id, deletedAt: null },
      select: { organizationId: true },
    });
    if (!course) return fail("Course not found.", "NOT_FOUND");
    organizationId = course.organizationId;
  } else {
    organizationId = (
      await db.teacherProfile.findUnique({
        where: { userId: user.id },
        select: { organizationId: true },
      })
    )?.organizationId ?? null;
  }
  if (!organizationId) return fail("Teacher profile not found.", "NOT_FOUND");
  const billingBlock = await getOrganizationGrowthWriteBlock(organizationId);
  if (billingBlock) return fail(billingBlock, "FORBIDDEN");
  const discountError = validateDiscount(parsed.data.discountType, parsed.data.discountValue);
  if (discountError) return fail(discountError);
  if (parsed.data.startsAt && parsed.data.endsAt && parsed.data.endsAt <= parsed.data.startsAt) {
    return fail("Coupon end must be after its start.");
  }
  try {
    const coupon = await db.courseCoupon.create({
      data: {
        teacherId: user.id,
        courseId: parsed.data.courseId,
        code: parsed.data.code.toUpperCase(),
        discountType: parsed.data.discountType,
        discountValue: parsed.data.discountValue,
        startsAt: parsed.data.startsAt,
        endsAt: parsed.data.endsAt,
        active: parsed.data.active,
        maxRedemptions: parsed.data.maxRedemptions,
      },
      select: { id: true },
    });
    if (parsed.data.courseId) refreshCourse(parsed.data.courseId);
    return ok({ couponId: coupon.id });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
      return fail("You already use this coupon code.", "CONFLICT");
    }
    throw error;
  }
}

export async function setCoursePromotionActive(
  input: unknown,
): Promise<ActionResult<{ active: boolean }>> {
  const parsed = promotionStateSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid promotion.");
  const user = await requireAuth();
  const restriction = await getScopeRestriction(user.id, "selling");
  if (restriction) return fail(restriction, "FORBIDDEN");
  const profile = await db.teacherProfile.findUnique({
    where: { userId: user.id },
    select: { organizationId: true },
  });
  if (!profile) return fail("Teacher profile not found.", "NOT_FOUND");
  const billingBlock = await getOrganizationGrowthWriteBlock(profile.organizationId);
  if (billingBlock) return fail(billingBlock, "FORBIDDEN");

  const updated =
    parsed.data.kind === "sale"
      ? await db.courseSale.updateMany({
          where: { id: parsed.data.id, teacherId: user.id },
          data: { active: parsed.data.active },
        })
      : await db.courseCoupon.updateMany({
          where: { id: parsed.data.id, teacherId: user.id },
          data: { active: parsed.data.active },
        });
  if (updated.count === 0) return fail("Promotion not found.", "NOT_FOUND");
  revalidatePath("/courses");
  revalidatePath("/dashboard/teacher/courses");
  return ok({ active: parsed.data.active });
}

/**
 * QLT-10: let a student publish or unpublish their OWN question.
 *
 * Distinct from setCourseQuestionHidden, which is the teacher and admin moderation control.
 * Scoped by studentId in the where clause rather than checked separately, so a mismatched id
 * updates nothing instead of relying on a guard someone can later reorder.
 */
export async function setCourseQuestionPublic(
  input: unknown,
): Promise<ActionResult<{ isPublic: boolean }>> {
  const parsed = z
    .object({ questionId: z.uuid(), isPublic: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid question.");
  const user = await requireAuth();

  const question = await db.courseQuestion.findFirst({
    where: { id: parsed.data.questionId, studentId: user.id },
    select: { id: true, courseId: true },
  });
  if (!question) return fail("Question not found.", "NOT_FOUND");

  await db.courseQuestion.update({
    where: { id: question.id },
    data: { isPublic: parsed.data.isPublic },
  });
  refreshCourse(question.courseId);
  return ok({ isPublic: parsed.data.isPublic });
}

/** QLT-10: a student can withdraw their own question entirely. */
export async function deleteCourseQuestion(
  input: unknown,
): Promise<ActionResult<{ deleted: true }>> {
  const parsed = z.object({ questionId: z.uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid question.");
  const user = await requireAuth();

  const question = await db.courseQuestion.findFirst({
    where: { id: parsed.data.questionId, studentId: user.id },
    select: { id: true, courseId: true },
  });
  if (!question) return fail("Question not found.", "NOT_FOUND");

  // The answer is cascade-deleted with the question.
  await db.courseQuestion.delete({ where: { id: question.id } });
  refreshCourse(question.courseId);
  return ok({ deleted: true });
}
