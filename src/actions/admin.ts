"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
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
    select: { id: true, status: true },
  });

  if (!profile) return fail("Teacher profile not found.", "NOT_FOUND");
  if (profile.status === "approved") {
    return fail("Teacher profile is already approved.", "CONFLICT");
  }

  await db.$transaction([
    db.teacherProfile.update({
      where: { id: profile.id },
      data: { status: "approved", rejectionReason: null },
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
  revalidatePath("/admin/reviews");
  revalidatePath("/courses");
  revalidatePath(`/courses/${review.course.slug}`);
  return ok({ status: decision });
}
