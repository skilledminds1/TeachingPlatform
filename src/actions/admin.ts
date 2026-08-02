"use server";

import { recomputeCourseAggregatesSafely } from "@/server/courses/aggregates";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isRestrictedJurisdiction } from "@/lib/compliance/restricted-jurisdictions";
import { db } from "@/lib/db";
import { recordComplianceEvent } from "@/server/compliance/events";
import { screenName } from "@/server/compliance/screening";
import { courseIdSchema, rejectCourseSchema } from "@/lib/validations/courses";
import { requirePlatformAdmin } from "@/server/auth/session";
import {
  notifyCourseApproved,
  notifyCourseRejected,
  notifyTeacherProfileApproved,
  notifyTeacherProfileRejected,
} from "@/server/notifications/notify";
import { fail, ok, type ActionResult } from "@/types/action";

const idSchema = z.string().uuid();
const rejectionSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(5, "Provide a rejection reason").max(500),
});

export async function approveTeacherProfile(
  profileId: string,
): Promise<ActionResult<{ approved: true }>> {
  const parsedId = idSchema.safeParse(profileId);
  if (!parsedId.success) {
    return fail("Invalid teacher profile.", "VALIDATION_ERROR");
  }

  const admin = await requirePlatformAdmin();
  const profile = await db.teacherProfile.findUnique({
    where: { id: parsedId.data },
    select: {
      id: true,
      status: true,
      userId: true,
      user: { select: { name: true, email: true, country: true } },
    },
  });

  if (!profile) return fail("Teacher profile not found.", "NOT_FOUND");
  if (profile.status === "approved") {
    return fail("Teacher profile is already approved.", "CONFLICT");
  }

  // INT-13: approval is the last gate before someone can be paid, so both compliance checks
  // run here — not at registration only, because a teacher's country can change and because
  // the sanctions list changes daily.
  if (isRestrictedJurisdiction(profile.user.country)) {
    await recordComplianceEvent({
      kind: "jurisdiction_blocked",
      userId: profile.userId,
      email: profile.user.email,
      countryCode: profile.user.country,
      detail: { stage: "teacher_approval", profileId: profile.id, adminUserId: admin.id },
    });
    return fail(
      `This teacher's country (${profile.user.country ?? "unknown"}) is a restricted jurisdiction and cannot be approved.`,
      "FORBIDDEN",
    );
  }

  const screening = await screenName(profile.user.name);

  // An unreadable list is NOT a clear result. Holding is the only safe reading: approving on
  // "we could not check" is precisely the failure this feature exists to prevent.
  if (screening.status !== "clear") {
    await db.teacherProfile.update({
      where: { id: profile.id },
      data: {
        screeningStatus: "review_required",
        screenedAt: screening.screenedAt,
        screeningSource: screening.source,
        screeningMatches: screening.matches,
      },
    });
    await recordComplianceEvent({
      kind:
        screening.status === "unavailable"
          ? "screening_unavailable"
          : "screening_review_required",
      userId: profile.userId,
      email: profile.user.email,
      countryCode: profile.user.country,
      detail: {
        stage: "teacher_approval",
        profileId: profile.id,
        adminUserId: admin.id,
        source: screening.source,
        matches: screening.matches,
      },
    });

    return fail(
      screening.status === "unavailable"
        ? "The sanctions list could not be reached, so this approval is on hold. Try again shortly."
        : `This name matches ${screening.matches.length} sanctions-list entr${screening.matches.length === 1 ? "y" : "ies"} and needs manual review before approval.`,
      "CONFLICT",
    );
  }

  await db.$transaction([
    db.teacherProfile.update({
      where: { id: profile.id },
      data: {
        status: "approved",
        rejectionReason: null,
        // INT-13: the screening outcome is stored on the row so the decision can be audited
        // later against a list that has since changed.
        screeningStatus: "clear",
        screenedAt: screening.screenedAt,
        screeningSource: screening.source,
        screeningMatches: [],
      },
    }),
    db.teacherQualification.updateMany({
      where: { teacherProfileId: profile.id, status: "pending" },
      data: { status: "verified", rejectionReason: null },
    }),
    db.adminAuditLog.create({
      data: {
        adminUserId: admin.id,
        action: "teacher_profile.approved",
        targetType: "TeacherProfile",
        targetId: profile.id,
        metadata: { previousStatus: profile.status },
      },
    }),
  ]);

  await notifyTeacherProfileApproved(profile.id).catch(() => undefined);

  revalidatePath("/admin");
  revalidatePath("/admin/teachers");
  revalidatePath("/dashboard/notifications");
  return ok({ approved: true });
}

export async function rejectTeacherProfile(
  profileId: string,
  reason: string,
): Promise<ActionResult<{ rejected: true }>> {
  const parsed = rejectionSchema.safeParse({ id: profileId, reason });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid input.", "VALIDATION_ERROR");
  }

  const admin = await requirePlatformAdmin();
  const profile = await db.teacherProfile.findUnique({
    where: { id: parsed.data.id },
    select: { id: true, status: true },
  });

  if (!profile) return fail("Teacher profile not found.", "NOT_FOUND");

  await db.$transaction([
    db.teacherProfile.update({
      where: { id: profile.id },
      data: { status: "rejected", rejectionReason: parsed.data.reason },
    }),
    db.adminAuditLog.create({
      data: {
        adminUserId: admin.id,
        action: "teacher_profile.rejected",
        targetType: "TeacherProfile",
        targetId: profile.id,
        metadata: {
          previousStatus: profile.status,
          reason: parsed.data.reason,
        },
      },
    }),
  ]);
  await notifyTeacherProfileRejected(profile.id).catch(() => undefined);

  revalidatePath("/admin");
  revalidatePath("/admin/teachers");
  return ok({ rejected: true });
}

export async function approveCourse(
  input: unknown,
): Promise<ActionResult<{ approved: true }>> {
  const parsed = courseIdSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid course.", "VALIDATION_ERROR");
  }
  const admin = await requirePlatformAdmin();
  const course = await db.course.findFirst({
    where: { id: parsed.data.courseId, deletedAt: null },
    select: { id: true, slug: true, status: true },
  });
  if (!course) return fail("Course not found.", "NOT_FOUND");
  if (course.status !== "pending_approval") {
    return fail("Only courses pending approval can be approved.", "CONFLICT");
  }

  await db.$transaction([
    db.course.update({
      where: { id: course.id },
      data: {
        status: "published",
        reviewedAt: new Date(),
        publishedAt: new Date(),
        rejectionReason: null,
      },
    }),
    db.adminAuditLog.create({
      data: {
        adminUserId: admin.id,
        action: "course.approved",
        targetType: "Course",
        targetId: course.id,
        metadata: { previousStatus: course.status },
      },
    }),
  ]);
  await notifyCourseApproved(course.id).catch(() => undefined);
  revalidatePath("/admin");
  revalidatePath("/admin/courses");
  revalidatePath(`/admin/courses/${course.id}`);
  revalidatePath("/courses");
  revalidatePath(`/courses/${course.slug}`);
  revalidatePath("/dashboard/teacher/courses");
  revalidatePath(`/dashboard/teacher/courses/${course.id}`);
  return ok({ approved: true });
}

/**
 * MON-32: take a LIVE course off the marketplace.
 *
 * approveCourse and rejectCourse both refuse anything that is not `pending_approval`, so
 * once a course was published the only person who could remove it was the teacher who owns
 * it. An admin faced with infringing or unsafe content that had already passed review had
 * no lever at all.
 *
 * Existing enrollments are deliberately left intact: students paid the teacher directly and
 * the platform cannot refund them, so revoking access would take away something already
 * bought. Removing it from discovery stops the harm spreading.
 */
export async function takedownCourse(
  input: unknown,
): Promise<ActionResult<{ removed: true }>> {
  const parsed = rejectCourseSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid course.", "VALIDATION_ERROR");
  }
  const admin = await requirePlatformAdmin();
  const course = await db.course.findFirst({
    where: { id: parsed.data.courseId, deletedAt: null },
    select: { id: true, slug: true, status: true },
  });
  if (!course) return fail("Course not found.", "NOT_FOUND");
  if (course.status !== "published") {
    return fail("Only a published course can be taken down.", "CONFLICT");
  }

  await db.$transaction([
    db.course.update({
      where: { id: course.id },
      data: {
        status: "rejected",
        reviewedAt: new Date(),
        publishedAt: null,
        rejectionReason: parsed.data.reason,
      },
    }),
    db.adminAuditLog.create({
      data: {
        adminUserId: admin.id,
        action: "course.takedown",
        targetType: "Course",
        targetId: course.id,
        metadata: { previousStatus: course.status, reason: parsed.data.reason },
      },
    }),
  ]);
  await notifyCourseRejected(course.id).catch(() => undefined);
  revalidatePath("/admin");
  revalidatePath("/admin/courses");
  revalidatePath(`/admin/courses/${course.id}`);
  revalidatePath("/courses");
  revalidatePath(`/courses/${course.slug}`);
  return ok({ removed: true });
}

export async function rejectCourse(
  input: unknown,
): Promise<ActionResult<{ rejected: true }>> {
  const parsed = rejectCourseSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid course.", "VALIDATION_ERROR");
  }
  const admin = await requirePlatformAdmin();
  const course = await db.course.findFirst({
    where: { id: parsed.data.courseId, deletedAt: null },
    select: { id: true, slug: true, status: true },
  });
  if (!course) return fail("Course not found.", "NOT_FOUND");
  if (course.status !== "pending_approval") {
    return fail("Only courses pending approval can be rejected.", "CONFLICT");
  }

  await db.$transaction([
    db.course.update({
      where: { id: course.id },
      data: {
        status: "rejected",
        reviewedAt: new Date(),
        publishedAt: null,
        rejectionReason: parsed.data.reason,
      },
    }),
    db.adminAuditLog.create({
      data: {
        adminUserId: admin.id,
        action: "course.rejected",
        targetType: "Course",
        targetId: course.id,
        metadata: { previousStatus: course.status, reason: parsed.data.reason },
      },
    }),
  ]);
  await notifyCourseRejected(course.id).catch(() => undefined);
  revalidatePath("/admin");
  revalidatePath("/admin/courses");
  revalidatePath(`/admin/courses/${course.id}`);
  revalidatePath("/courses");
  revalidatePath(`/courses/${course.slug}`);
  revalidatePath("/dashboard/teacher/courses");
  revalidatePath(`/dashboard/teacher/courses/${course.id}`);
  return ok({ rejected: true });
}

export async function moderateReview(
  reviewId: string,
  decision: "approved" | "rejected",
): Promise<ActionResult<{ status: "approved" | "rejected" }>> {
  const parsedId = idSchema.safeParse(reviewId);
  if (!parsedId.success) {
    return fail("Invalid review.", "VALIDATION_ERROR");
  }

  const admin = await requirePlatformAdmin();
  const review = await db.review.findUnique({
    where: { id: parsedId.data },
    select: { id: true, status: true },
  });

  if (!review) return fail("Review not found.", "NOT_FOUND");

  await db.$transaction([
    db.review.update({
      where: { id: review.id },
      data: { status: decision },
    }),
    db.adminAuditLog.create({
      data: {
        adminUserId: admin.id,
        action: `review.${decision}`,
        targetType: "Review",
        targetId: review.id,
        metadata: { previousStatus: review.status },
      },
    }),
  ]);

  revalidatePath("/admin");
  revalidatePath("/admin/reviews");
  return ok({ status: decision });
}

export async function moderateCourseReview(
  reviewId: string,
  decision: "approved" | "rejected",
): Promise<ActionResult<{ status: "approved" | "rejected" }>> {
  const parsedId = idSchema.safeParse(reviewId);
  if (!parsedId.success) return fail("Invalid course review.", "VALIDATION_ERROR");
  const admin = await requirePlatformAdmin();
  const review = await db.courseReview.findUnique({
    where: { id: parsedId.data },
    select: { id: true, status: true, courseId: true, course: { select: { slug: true } } },
  });
  if (!review) return fail("Course review not found.", "NOT_FOUND");
  await db.$transaction([
    db.courseReview.update({ where: { id: review.id }, data: { status: decision } }),
    db.adminAuditLog.create({
      data: {
        adminUserId: admin.id,
        action: `course_review.${decision}`,
        targetType: "CourseReview",
        targetId: review.id,
        metadata: { previousStatus: review.status, courseId: review.courseId },
      },
    }),
  ]);

  // QLT-07: approving or rejecting is what actually moves the average the catalog
  // filters and sorts on, so this is the decisive recompute of the four.
  await recomputeCourseAggregatesSafely(review.courseId);
  revalidatePath("/admin/reviews");
  revalidatePath("/courses");
  revalidatePath(`/courses/${review.course.slug}`);
  return ok({ status: decision });
}
