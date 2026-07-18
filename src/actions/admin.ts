"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/server/auth/session";
import { notifyTeacherProfileApproved } from "@/server/notifications/notify";
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

  revalidatePath("/admin");
  revalidatePath("/admin/teachers");
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
