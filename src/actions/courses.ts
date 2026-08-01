"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  courseCoverFileSchema,
  courseIdSchema,
  courseMediaConfirmSchema,
  courseMediaUploadRequestSchema,
  createCourseSchema,
  createLessonSchema,
  createModuleSchema,
  lessonFileSchema,
  lessonIdSchema,
  assetIdSchema,
  moduleIdSchema,
  reorderLessonsSchema,
  reorderModulesSchema,
  updateCourseSchema,
  updateLessonSchema,
  updateModuleSchema,
} from "@/lib/validations/courses";
import { getCurrentUser, requireAuth } from "@/server/auth/session";
import { getOrganizationGrowthWriteBlock } from "@/server/billing/write-gate";
import { getCourseUsage } from "@/server/billing/entitlements";
import {
  assertCourseOwnership,
  canSubmitCourse,
  getTeacherCourseContext,
} from "@/server/courses/access";
import { issueCertificateIfEligible } from "@/server/courses/certificates";
import {
  courseMediaPathOwnedBy,
  createCourseMediaPath,
  ensureCourseMediaBucket,
  hasValidCourseMediaSignature,
  validateCourseMediaMetadata,
} from "@/server/courses/media";
import { getLessonDownloadAccess } from "@/server/courses/queries";
import { canAccessCourseMedia } from "@/server/courses/quality";
import { enforceActionRateLimit } from "@/server/security/action-rate-limit";
import { getScopeRestriction } from "@/server/trust/enforcement";
import { fail, ok, type ActionResult } from "@/types/action";
import { slugify } from "@/utils/slugify";

function validationFailure(message?: string) {
  return fail(message ?? "Invalid course data.", "VALIDATION_ERROR");
}

const COURSE_AUTHORING_PLANS = new Set(["professional", "business"]);

async function courseAuthoringPlanFailure(
  userId: string,
): Promise<ReturnType<typeof fail> | null> {
  const restriction = await getScopeRestriction(userId, "publishing");
  if (restriction) return fail(restriction, "FORBIDDEN");
  const context = await getTeacherCourseContext(userId);
  const billingBlock = await getOrganizationGrowthWriteBlock(context.organization.id);
  if (billingBlock) return fail(billingBlock, "FORBIDDEN");
  if (COURSE_AUTHORING_PLANS.has(context.plan.slug)) return null;
  return fail(
    "Course creation and uploads require a Professional or Business subscription.",
    "PLAN_LIMIT_EXCEEDED",
  );
}

function hasValidImageSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((value, index) => bytes[index] === value);
  }
  if (mimeType === "image/webp") {
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }
  return false;
}

function revalidateCoursePaths(courseId?: string, slug?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/teacher/courses");
  revalidatePath("/dashboard/courses");
  revalidatePath("/courses");
  revalidatePath("/admin/courses");
  if (courseId) revalidatePath(`/dashboard/teacher/courses/${courseId}`);
  if (courseId) revalidatePath(`/admin/courses/${courseId}`);
  if (slug) revalidatePath(`/courses/${slug}`);
}

async function validateSubject(subjectId: string | null | undefined) {
  if (!subjectId) return true;
  return Boolean(
    await db.subject.findUnique({
      where: { id: subjectId },
      select: { id: true },
    }),
  );
}

async function getOwnedModule(moduleId: string, teacherId: string) {
  const courseModule = await db.courseModule.findUnique({
    where: { id: moduleId },
    select: {
      id: true,
      courseId: true,
      course: {
        select: { teacherId: true, slug: true, deletedAt: true },
      },
    },
  });
  if (!courseModule || courseModule.course.deletedAt) return null;
  if (courseModule.course.teacherId !== teacherId) return null;
  return courseModule;
}

async function getOwnedLesson(lessonId: string, teacherId: string) {
  const lesson = await db.courseLesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      isPreview: true,
      fileStoragePath: true,
      module: {
        select: {
          id: true,
          courseId: true,
          course: {
            select: { teacherId: true, slug: true, deletedAt: true },
          },
        },
      },
    },
  });
  if (!lesson || lesson.module.course.deletedAt) return null;
  if (lesson.module.course.teacherId !== teacherId) return null;
  return lesson;
}

export async function createCourse(
  input: unknown,
): Promise<ActionResult<{ courseId: string; slug: string }>> {
  const parsed = createCourseSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message);

  const user = await requireAuth();
  const restriction = await getScopeRestriction(user.id, "selling");
  if (restriction) return fail(restriction, "FORBIDDEN");
  const context = await getTeacherCourseContext(user.id);
  const billingBlock = await getOrganizationGrowthWriteBlock(context.organization.id);
  if (billingBlock) return fail(billingBlock, "FORBIDDEN");
  if (!COURSE_AUTHORING_PLANS.has(context.plan.slug)) {
    return fail(
      "Course creation and uploads require a Professional or Business subscription.",
      "PLAN_LIMIT_EXCEEDED",
    );
  }
  const usage = await getCourseUsage(context.organization.id);
  if (usage.atLimit) {
    const upgradeHint = usage.recommendedPlan
      ? ` Upgrade to ${usage.recommendedPlan.name} to create another course.`
      : " Upgrade your plan to create another course.";
    return fail(
      `Your ${usage.plan.name} plan allows ${usage.limit} course${
        usage.limit === 1 ? "" : "s"
      }.${upgradeHint}`,
      "PLAN_LIMIT_EXCEEDED",
    );
  }
  if (!(await validateSubject(parsed.data.subjectId))) {
    return validationFailure("Select a valid subject.");
  }

  const baseSlug = slugify(parsed.data.title) || "course";
  const slug = `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;
  const course = await db.course.create({
    data: {
      teacherId: user.id,
      organizationId: context.organization.id,
      title: parsed.data.title,
      description: parsed.data.description,
      subjectId: parsed.data.subjectId,
      priceCents: parsed.data.priceCents,
      currency: parsed.data.currency,
      level: parsed.data.level,
      slug,
    },
    select: { id: true, slug: true },
  });

  revalidateCoursePaths(course.id, course.slug);
  return ok({ courseId: course.id, slug: course.slug });
}

export async function updateCourse(
  input: unknown,
): Promise<ActionResult<{ updated: true }>> {
  const parsed = updateCourseSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message);
  const user = await requireAuth();
  const planFailure = await courseAuthoringPlanFailure(user.id);
  if (planFailure) return planFailure;
  const course = await assertCourseOwnership(parsed.data.courseId, user.id);
  if (!(await validateSubject(parsed.data.subjectId))) {
    return validationFailure("Select a valid subject.");
  }

  const current = await db.course.findUniqueOrThrow({
    where: { id: course.id },
    select: {
      title: true,
      description: true,
      subjectId: true,
      priceCents: true,
      currency: true,
      level: true,
      certificateEnabled: true,
    },
  });
  const { courseId, ...parsedData } = parsed.data;
  const hasSubjectId =
    Boolean(input) &&
    typeof input === "object" &&
    Object.prototype.hasOwnProperty.call(input, "subjectId");
  const data = {
    ...parsedData,
    subjectId: hasSubjectId ? parsedData.subjectId : undefined,
  };
  // MON-33: only changes to what was actually moderated should trigger re-review. Price,
  // currency, level and certificateEnabled were previously treated as substantive, so a
  // teacher correcting a typo in their price silently delisted a live, selling course. It
  // also dropped to `draft` rather than `pending_approval`, so the course never re-entered
  // the queue — the teacher had to notice and resubmit, then wait out the 48-hour SLA.
  const REVIEWABLE_FIELDS = ["title", "description", "subjectId"] as const;
  const contentChanged = REVIEWABLE_FIELDS.some(
    (key) => data[key] !== undefined && data[key] !== current[key],
  );

  await db.course.update({
    where: { id: courseId },
    data: {
      ...data,
      // Keep the course live and purchasable while it is re-reviewed, and requeue it
      // automatically instead of silently parking it in draft.
      ...(course.status === "published" && contentChanged
        ? { status: "pending_approval" }
        : {}),
    },
  });
  revalidateCoursePaths(courseId, course.slug);
  return ok({ updated: true });
}

export async function archiveCourse(
  input: unknown,
): Promise<ActionResult<{ archived: true }>> {
  const parsed = courseIdSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message);
  const user = await requireAuth();
  const course = await assertCourseOwnership(parsed.data.courseId, user.id);
  await db.course.update({
    where: { id: course.id },
    data: { status: "archived", publishedAt: null },
  });
  revalidateCoursePaths(course.id, course.slug);
  return ok({ archived: true });
}

export async function removeCourse(
  input: unknown,
): Promise<ActionResult<{ removed: true }>> {
  const parsed = courseIdSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message);
  const user = await requireAuth();
  const course = await assertCourseOwnership(parsed.data.courseId, user.id);
  const [enrollmentCount, purchaseCount] = await Promise.all([
    db.courseEnrollment.count({ where: { courseId: course.id } }),
    db.coursePurchase.count({ where: { courseId: course.id } }),
  ]);
  if (enrollmentCount > 0 || purchaseCount > 0) {
    return fail(
      "Courses with students or purchases cannot be removed. Archive the course instead.",
      "CONFLICT",
    );
  }
  await db.course.update({
    where: { id: course.id },
    data: {
      deletedAt: new Date(),
      status: "archived",
      publishedAt: null,
    },
  });
  revalidateCoursePaths(course.id, course.slug);
  return ok({ removed: true });
}

export async function submitCourseForReview(
  input: unknown,
): Promise<ActionResult<{ submitted: true }>> {
  const parsed = courseIdSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message);
  const user = await requireAuth();
  const planFailure = await courseAuthoringPlanFailure(user.id);
  if (planFailure) return planFailure;
  const course = await assertCourseOwnership(parsed.data.courseId, user.id);
  const readiness = await canSubmitCourse(course.id, user.id);
  if (!readiness.allowed) {
    return fail(readiness.reasons[0] ?? "Course is not ready for review.", "VALIDATION_ERROR");
  }
  await db.course.update({
    where: { id: course.id },
    data: {
      status: "pending_approval",
      submittedAt: new Date(),
      reviewedAt: null,
      rejectionReason: null,
      publishedAt: null,
    },
  });
  revalidateCoursePaths(course.id, course.slug);
  return ok({ submitted: true });
}

/** @deprecated Use submitCourseForReview. */
export async function publishCourse(
  input: unknown,
): Promise<ActionResult<{ published: true }>> {
  const result = await submitCourseForReview(input);
  if (!result.success) return result;
  return ok({ published: true });
}

export async function unpublishCourse(
  input: unknown,
): Promise<ActionResult<{ unpublished: true }>> {
  const parsed = courseIdSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message);
  const user = await requireAuth();
  const course = await assertCourseOwnership(parsed.data.courseId, user.id);
  await db.course.update({
    where: { id: course.id },
    data: { status: "draft", publishedAt: null },
  });
  revalidateCoursePaths(course.id, course.slug);
  return ok({ unpublished: true });
}

export async function addModule(
  input: unknown,
): Promise<ActionResult<{ moduleId: string }>> {
  const parsed = createModuleSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message);
  const user = await requireAuth();
  const planFailure = await courseAuthoringPlanFailure(user.id);
  if (planFailure) return planFailure;
  const course = await assertCourseOwnership(parsed.data.courseId, user.id);
  const last = await db.courseModule.aggregate({
    where: { courseId: course.id },
    _max: { sortOrder: true },
  });
  const courseModule = await db.courseModule.create({
    data: {
      courseId: course.id,
      title: parsed.data.title,
      sortOrder: (last._max.sortOrder ?? -1) + 1,
    },
    select: { id: true },
  });
  revalidateCoursePaths(course.id, course.slug);
  return ok({ moduleId: courseModule.id });
}

export async function updateModule(
  input: unknown,
): Promise<ActionResult<{ updated: true }>> {
  const parsed = updateModuleSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message);
  const user = await requireAuth();
  const planFailure = await courseAuthoringPlanFailure(user.id);
  if (planFailure) return planFailure;
  const courseModule = await getOwnedModule(parsed.data.moduleId, user.id);
  if (!courseModule) return fail("Module not found.", "NOT_FOUND");
  await db.courseModule.update({
    where: { id: courseModule.id },
    data: { title: parsed.data.title },
  });
  revalidateCoursePaths(courseModule.courseId, courseModule.course.slug);
  return ok({ updated: true });
}

export async function deleteModule(
  input: unknown,
): Promise<ActionResult<{ deleted: true }>> {
  const parsed = moduleIdSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message);
  const user = await requireAuth();
  const planFailure = await courseAuthoringPlanFailure(user.id);
  if (planFailure) return planFailure;
  const courseModule = await getOwnedModule(parsed.data.moduleId, user.id);
  if (!courseModule) return fail("Module not found.", "NOT_FOUND");
  await db.courseModule.delete({ where: { id: courseModule.id } });
  revalidateCoursePaths(courseModule.courseId, courseModule.course.slug);
  return ok({ deleted: true });
}

export async function reorderModules(
  input: unknown,
): Promise<ActionResult<{ reordered: true }>> {
  const parsed = reorderModulesSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message);
  if (new Set(parsed.data.moduleIds).size !== parsed.data.moduleIds.length) {
    return validationFailure("Module order contains duplicates.");
  }
  const user = await requireAuth();
  const planFailure = await courseAuthoringPlanFailure(user.id);
  if (planFailure) return planFailure;
  const course = await assertCourseOwnership(parsed.data.courseId, user.id);
  const existing = await db.courseModule.findMany({
    where: { courseId: course.id },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((item) => item.id));
  if (
    existing.length !== parsed.data.moduleIds.length ||
    parsed.data.moduleIds.some((id) => !existingIds.has(id))
  ) {
    return validationFailure("Module order must include every course module exactly once.");
  }
  await db.$transaction(
    parsed.data.moduleIds.map((id, sortOrder) =>
      db.courseModule.update({ where: { id }, data: { sortOrder } }),
    ),
  );
  revalidateCoursePaths(course.id, course.slug);
  return ok({ reordered: true });
}

export async function addLesson(
  input: unknown,
): Promise<ActionResult<{ lessonId: string }>> {
  const parsed = createLessonSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message);
  const user = await requireAuth();
  const planFailure = await courseAuthoringPlanFailure(user.id);
  if (planFailure) return planFailure;
  const courseModule = await getOwnedModule(parsed.data.moduleId, user.id);
  if (!courseModule) return fail("Module not found.", "NOT_FOUND");
  const last = await db.courseLesson.aggregate({
    where: { moduleId: courseModule.id },
    _max: { sortOrder: true },
  });
  const lesson = await db.courseLesson.create({
    data: {
      moduleId: courseModule.id,
      title: parsed.data.title,
      content: parsed.data.content,
      videoUrl: parsed.data.videoUrl,
      sortOrder: (last._max.sortOrder ?? -1) + 1,
    },
    select: { id: true },
  });
  revalidateCoursePaths(courseModule.courseId, courseModule.course.slug);
  return ok({ lessonId: lesson.id });
}

export async function updateLesson(
  input: unknown,
): Promise<ActionResult<{ updated: true }>> {
  const parsed = updateLessonSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message);
  const user = await requireAuth();
  const planFailure = await courseAuthoringPlanFailure(user.id);
  if (planFailure) return planFailure;
  const lesson = await getOwnedLesson(parsed.data.lessonId, user.id);
  if (!lesson) return fail("Lesson not found.", "NOT_FOUND");
  const { lessonId, ...data } = parsed.data;
  if (data.isPreview && !lesson.isPreview) {
    const [lessonCount, previewCount] = await Promise.all([
      db.courseLesson.count({
        where: { module: { courseId: lesson.module.courseId } },
      }),
      db.courseLesson.count({
        where: { module: { courseId: lesson.module.courseId }, isPreview: true },
      }),
    ]);
    if (previewCount >= 3) return validationFailure("A course can have at most 3 previews.");
    if (lessonCount <= 1 || previewCount + 1 >= lessonCount) {
      return validationFailure("At least one lesson must remain private.");
    }
  }
  await db.courseLesson.update({ where: { id: lessonId }, data });
  revalidateCoursePaths(lesson.module.courseId, lesson.module.course.slug);
  return ok({ updated: true });
}

export async function deleteLesson(
  input: unknown,
): Promise<ActionResult<{ deleted: true }>> {
  const parsed = lessonIdSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message);
  const user = await requireAuth();
  const planFailure = await courseAuthoringPlanFailure(user.id);
  if (planFailure) return planFailure;
  const lesson = await getOwnedLesson(parsed.data.lessonId, user.id);
  if (!lesson) return fail("Lesson not found.", "NOT_FOUND");
  if (!lesson.isPreview) {
    const [privateLessonCount, previewLessonCount] = await Promise.all([
      db.courseLesson.count({
        where: { module: { courseId: lesson.module.courseId }, isPreview: false },
      }),
      db.courseLesson.count({
        where: { module: { courseId: lesson.module.courseId }, isPreview: true },
      }),
    ]);
    if (privateLessonCount === 1 && previewLessonCount > 0) {
      return validationFailure(
        "Remove preview access from another lesson before deleting the final private lesson.",
      );
    }
  }
  await db.courseLesson.delete({ where: { id: lesson.id } });
  if (lesson.fileStoragePath) {
    await createAdminClient().storage
      .from("course-files")
      .remove([lesson.fileStoragePath])
      .catch(() => undefined);
  }
  revalidateCoursePaths(lesson.module.courseId, lesson.module.course.slug);
  return ok({ deleted: true });
}

export async function reorderLessons(
  input: unknown,
): Promise<ActionResult<{ reordered: true }>> {
  const parsed = reorderLessonsSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message);
  if (new Set(parsed.data.lessonIds).size !== parsed.data.lessonIds.length) {
    return validationFailure("Lesson order contains duplicates.");
  }
  const user = await requireAuth();
  const planFailure = await courseAuthoringPlanFailure(user.id);
  if (planFailure) return planFailure;
  const courseModule = await getOwnedModule(parsed.data.moduleId, user.id);
  if (!courseModule) return fail("Module not found.", "NOT_FOUND");
  const existing = await db.courseLesson.findMany({
    where: { moduleId: courseModule.id },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((item) => item.id));
  if (
    existing.length !== parsed.data.lessonIds.length ||
    parsed.data.lessonIds.some((id) => !existingIds.has(id))
  ) {
    return validationFailure("Lesson order must include every module lesson exactly once.");
  }
  await db.$transaction(
    parsed.data.lessonIds.map((id, sortOrder) =>
      db.courseLesson.update({ where: { id }, data: { sortOrder } }),
    ),
  );
  revalidateCoursePaths(courseModule.courseId, courseModule.course.slug);
  return ok({ reordered: true });
}

export async function uploadCourseCover(
  formData: FormData,
): Promise<ActionResult<{ coverImageUrl: string }>> {
  const courseId = formData.get("courseId");
  const parsedId = courseIdSchema.safeParse({ courseId });
  const parsedFile = courseCoverFileSchema.safeParse(formData.get("cover"));
  if (!parsedId.success) return validationFailure(parsedId.error.issues[0]?.message);
  if (!parsedFile.success) return validationFailure(parsedFile.error.issues[0]?.message);

  const user = await requireAuth();
  const limited = await enforceActionRateLimit({
    action: "upload",
    limit: 20,
    windowMs: 60 * 60_000,
    userId: user.id,
  });
  if (limited) return limited;
  const planFailure = await courseAuthoringPlanFailure(user.id);
  if (planFailure) return planFailure;
  const course = await assertCourseOwnership(parsedId.data.courseId, user.id);
  const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[
    parsedFile.data.type
  ];
  if (!extension) return validationFailure("Unsupported image format.");
  const bytes = new Uint8Array(await parsedFile.data.arrayBuffer());
  if (!hasValidImageSignature(bytes, parsedFile.data.type)) {
    return validationFailure("The uploaded file is not a valid image.");
  }
  const path = `${user.id}/${course.id}/cover-${Date.now()}.${extension}`;
  const supabase = createAdminClient();
  const { error } = await supabase.storage.from("course-covers").upload(path, bytes, {
    contentType: parsedFile.data.type,
    cacheControl: "3600",
    upsert: false,
  });
  if (error) return fail("Course cover upload failed. Please try again.");
  const {
    data: { publicUrl },
  } = supabase.storage.from("course-covers").getPublicUrl(path);
  await db.course.update({
    where: { id: course.id },
    data: { coverImageUrl: publicUrl },
  });
  const { data: files } = await supabase.storage
    .from("course-covers")
    .list(`${user.id}/${course.id}`);
  const stale = files
    ?.filter((file) => file.name !== path.split("/").at(-1))
    .map((file) => `${user.id}/${course.id}/${file.name}`);
  if (stale?.length) await supabase.storage.from("course-covers").remove(stale);
  revalidateCoursePaths(course.id, course.slug);
  return ok({ coverImageUrl: publicUrl });
}

export async function createCourseMediaUpload(
  input: unknown,
): Promise<ActionResult<{ path: string; token: string; contentType: string }>> {
  const parsed = courseMediaUploadRequestSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message);
  const metadataError = validateCourseMediaMetadata(parsed.data);
  if (metadataError) return validationFailure(metadataError);

  const user = await requireAuth();
  const limited = await enforceActionRateLimit({
    action: "upload",
    limit: 20,
    windowMs: 60 * 60_000,
    userId: user.id,
  });
  if (limited) return limited;
  const planFailure = await courseAuthoringPlanFailure(user.id);
  if (planFailure) return planFailure;
  const lesson = await getOwnedLesson(parsed.data.lessonId, user.id);
  if (!lesson) return fail("Lesson not found.", "NOT_FOUND");

  try {
    const supabase = await ensureCourseMediaBucket();
    const path = createCourseMediaPath({
      userId: user.id,
      courseId: lesson.module.courseId,
      lessonId: lesson.id,
      kind: parsed.data.kind,
      fileName: parsed.data.fileName,
    });
    const { data, error } = await supabase.storage
      .from("course-media")
      .createSignedUploadUrl(path);
    if (error || !data) return fail(error?.message ?? "Could not prepare the media upload.");
    return ok({ path: data.path, token: data.token, contentType: parsed.data.contentType });
  } catch (error) {
    return fail(
      error instanceof Error
        ? error.message
        : "Could not prepare the media upload. Check Supabase storage configuration.",
    );
  }
}

export async function confirmCourseMediaUpload(
  input: unknown,
): Promise<ActionResult<{ assetId: string }>> {
  const parsed = courseMediaConfirmSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message);
  const metadataError = validateCourseMediaMetadata(parsed.data);
  if (metadataError) return validationFailure(metadataError);

  const user = await requireAuth();
  const planFailure = await courseAuthoringPlanFailure(user.id);
  if (planFailure) return planFailure;
  const lesson = await getOwnedLesson(parsed.data.lessonId, user.id);
  if (!lesson) return fail("Lesson not found.", "NOT_FOUND");
  if (
    !courseMediaPathOwnedBy(
      parsed.data.path,
      user.id,
      lesson.module.courseId,
      lesson.id,
    )
  ) {
    return fail("Invalid course media path.", "FORBIDDEN");
  }

  const supabase = await ensureCourseMediaBucket();
  const slash = parsed.data.path.lastIndexOf("/");
  const folder = parsed.data.path.slice(0, slash);
  const objectName = parsed.data.path.slice(slash + 1);
  const { data: listed, error: listError } = await supabase.storage
    .from("course-media")
    .list(folder, { search: objectName, limit: 10 });
  if (listError) return fail("Could not verify the uploaded media.");
  const object = listed?.find((item) => item.name === objectName);
  if (!object) return fail("Uploaded media was not found.", "NOT_FOUND");

  const objectMetadata =
    object.metadata && typeof object.metadata === "object"
      ? (object.metadata as Record<string, unknown>)
      : null;
  const actualSize =
    objectMetadata && typeof objectMetadata.size === "number"
      ? objectMetadata.size
      : parsed.data.size;
  const actualType =
    objectMetadata && typeof objectMetadata.mimetype === "string"
      ? objectMetadata.mimetype
      : parsed.data.contentType;
  const actualMetadataError = validateCourseMediaMetadata({
    kind: parsed.data.kind,
    contentType: actualType,
    size: actualSize,
  });
  if (
    actualMetadataError ||
    actualSize !== parsed.data.size ||
    actualType !== parsed.data.contentType
  ) {
    await supabase.storage.from("course-media").remove([parsed.data.path]);
    return validationFailure(actualMetadataError ?? "Uploaded media does not match the request.");
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from("course-media")
    .createSignedUrl(parsed.data.path, 60);
  if (signedError || !signed?.signedUrl) return fail("Could not verify the uploaded media.");
  const response = await fetch(signed.signedUrl, { headers: { Range: "bytes=0-31" } });
  if (!response.ok) return fail("Could not verify the uploaded media.");
  const header = new Uint8Array(await response.arrayBuffer());
  if (!hasValidCourseMediaSignature(header, actualType)) {
    await supabase.storage.from("course-media").remove([parsed.data.path]);
    return validationFailure("The uploaded file signature does not match its file type.");
  }

  const duplicate = await db.courseLessonAsset.findFirst({
    where: { lessonId: lesson.id, storagePath: parsed.data.path },
    select: { id: true },
  });
  if (duplicate) return ok({ assetId: duplicate.id });

  const previousVideos =
    parsed.data.kind === "video"
      ? await db.courseLessonAsset.findMany({
          where: { lessonId: lesson.id, kind: "video" },
          select: { id: true, storagePath: true },
        })
      : [];
  const last = await db.courseLessonAsset.aggregate({
    where: { lessonId: lesson.id, kind: parsed.data.kind },
    _max: { sortOrder: true },
  });
  const asset = await db.$transaction(async (tx) => {
    if (previousVideos.length > 0) {
      await tx.courseLessonAsset.deleteMany({
        where: { id: { in: previousVideos.map((item) => item.id) } },
      });
    }
    return tx.courseLessonAsset.create({
      data: {
        lessonId: lesson.id,
        kind: parsed.data.kind,
        storagePath: parsed.data.path,
        fileName: parsed.data.fileName,
        mimeType: actualType,
        sizeBytes: actualSize,
        sortOrder: parsed.data.kind === "video" ? 0 : (last._max.sortOrder ?? -1) + 1,
      },
      select: { id: true },
    });
  });
  if (previousVideos.length > 0) {
    await supabase.storage
      .from("course-media")
      .remove(previousVideos.map((item) => item.storagePath))
      .catch(() => undefined);
  }
  revalidateCoursePaths(lesson.module.courseId, lesson.module.course.slug);
  return ok({ assetId: asset.id });
}

export async function removeCourseLessonAsset(
  input: unknown,
): Promise<ActionResult<{ removed: true }>> {
  const parsed = assetIdSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message);
  const user = await requireAuth();
  const asset = await db.courseLessonAsset.findUnique({
    where: { id: parsed.data.assetId },
    select: {
      id: true,
      storagePath: true,
      lesson: {
        select: {
          id: true,
          module: {
            select: {
              course: { select: { id: true, slug: true, teacherId: true, deletedAt: true } },
            },
          },
        },
      },
    },
  });
  const course = asset?.lesson.module.course;
  if (!asset || !course || course.deletedAt) return fail("Course asset not found.", "NOT_FOUND");
  if (course.teacherId !== user.id) return fail("You cannot remove this asset.", "FORBIDDEN");

  await db.courseLessonAsset.delete({ where: { id: asset.id } });
  await (await ensureCourseMediaBucket()).storage
    .from("course-media")
    .remove([asset.storagePath])
    .catch(() => undefined);
  revalidateCoursePaths(course.id, course.slug);
  return ok({ removed: true });
}

export async function getCourseAssetSignedUrl(
  input: unknown,
): Promise<
  ActionResult<{ signedUrl: string; fileName: string; kind: "video" | "resource" }>
> {
  const parsed = assetIdSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message);
  const user = await getCurrentUser();
  const asset = await db.courseLessonAsset.findUnique({
    where: { id: parsed.data.assetId },
    select: {
      storagePath: true,
      fileName: true,
      kind: true,
      lesson: {
        select: {
          isPreview: true,
          module: {
            select: {
              course: {
                select: {
                  teacherId: true,
                  status: true,
                  deletedAt: true,
                  enrollments: {
                    where: { studentId: user?.id ?? "00000000-0000-0000-0000-000000000000", revokedAt: null },
                    select: { id: true },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!asset || asset.lesson.module.course.deletedAt) {
    return fail("Course asset not found.", "NOT_FOUND");
  }
  const course = asset.lesson.module.course;
  if (!canAccessCourseMedia({
    isPreview: asset.lesson.isPreview,
    isPublished: course.status === "published",
    isEnrolled: course.enrollments.length > 0,
    isTeacher: course.teacherId === user?.id,
    isAdmin: Boolean(user?.isPlatformAdmin),
  })) {
    return fail("Enroll in this course to access its media.", "FORBIDDEN");
  }

  const bucket = (await ensureCourseMediaBucket()).storage.from("course-media");
  const { data, error } = await bucket.createSignedUrl(asset.storagePath, 300, {
    download: asset.kind === "resource" ? asset.fileName : false,
  });
  if (error || !data.signedUrl) return fail("Could not create the media link.");
  return ok({ signedUrl: data.signedUrl, fileName: asset.fileName, kind: asset.kind });
}

export async function uploadLessonFile(
  formData: FormData,
): Promise<ActionResult<{ fileName: string }>> {
  const lessonId = formData.get("lessonId");
  const parsedId = lessonIdSchema.safeParse({ lessonId });
  const parsedFile = lessonFileSchema.safeParse(formData.get("file"));
  if (!parsedId.success) return validationFailure(parsedId.error.issues[0]?.message);
  if (!parsedFile.success) return validationFailure(parsedFile.error.issues[0]?.message);
  const user = await requireAuth();
  const limited = await enforceActionRateLimit({
    action: "upload",
    limit: 20,
    windowMs: 60 * 60_000,
    userId: user.id,
  });
  if (limited) return limited;
  const planFailure = await courseAuthoringPlanFailure(user.id);
  if (planFailure) return planFailure;
  const lesson = await getOwnedLesson(parsedId.data.lessonId, user.id);
  if (!lesson) return fail("Lesson not found.", "NOT_FOUND");

  const safeName = parsedFile.data.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-160);
  const path = `${user.id}/${lesson.module.courseId}/${Date.now()}-${crypto.randomUUID().slice(
    0,
    8,
  )}-${safeName || "lesson-file"}`;
  const bytes = new Uint8Array(await parsedFile.data.arrayBuffer());
  // SEC-09: the declared MIME type is attacker-controlled, so confirm the file's magic
  // bytes agree with it before storing (same check the course-media path already does).
  if (!hasValidCourseMediaSignature(bytes, parsedFile.data.type)) {
    return fail("That file's contents do not match its type.", "VALIDATION_ERROR");
  }

  const supabase = createAdminClient();
  const { error } = await supabase.storage.from("course-files").upload(path, bytes, {
    contentType: parsedFile.data.type,
    cacheControl: "3600",
    upsert: false,
  });
  if (error) return fail("Lesson file upload failed. Please try again.");

  const oldPath = lesson.fileStoragePath;
  await db.courseLesson.update({
    where: { id: lesson.id },
    data: {
      fileStoragePath: path,
      fileName: parsedFile.data.name,
      fileMimeType: parsedFile.data.type,
    },
  });
  if (oldPath) {
    await supabase.storage.from("course-files").remove([oldPath]).catch(() => undefined);
  }
  revalidateCoursePaths(lesson.module.courseId, lesson.module.course.slug);
  return ok({ fileName: parsedFile.data.name });
}

export async function getLessonFileSignedUrl(
  input: unknown,
): Promise<ActionResult<{ signedUrl: string; fileName: string | null }>> {
  const parsed = lessonIdSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message);
  const user = await getCurrentUser();
  const access = await getLessonDownloadAccess(parsed.data.lessonId, user?.id, Boolean(user?.isPlatformAdmin));
  const { data, error } = await createAdminClient().storage
    .from("course-files")
    .createSignedUrl(access.storagePath, 60, {
      download: access.fileName ?? true,
    });
  if (error || !data.signedUrl) return fail("Could not create the download link.");
  return ok({ signedUrl: data.signedUrl, fileName: access.fileName });
}

export async function markLessonComplete(
  input: unknown,
): Promise<ActionResult<{ completed: true; certificateIssued: boolean }>> {
  const parsed = lessonIdSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message);
  const user = await requireAuth();
  const lesson = await db.courseLesson.findUnique({
    where: { id: parsed.data.lessonId },
    select: {
      id: true,
      module: {
        select: {
          course: {
            select: {
              id: true,
              slug: true,
              deletedAt: true,
              certificateEnabled: true,
              enrollments: {
                where: { studentId: user.id, revokedAt: null },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      },
    },
  });
  if (!lesson || lesson.module.course.deletedAt) return fail("Lesson not found.", "NOT_FOUND");
  if (lesson.module.course.enrollments.length === 0) {
    return fail("You must be enrolled to complete this lesson.", "FORBIDDEN");
  }
  await db.courseLessonProgress.upsert({
    where: {
      lessonId_studentId: { lessonId: lesson.id, studentId: user.id },
    },
    create: { lessonId: lesson.id, studentId: user.id, completedAt: new Date() },
    update: { completedAt: new Date() },
  });

  let certificateIssued = false;
  if (lesson.module.course.certificateEnabled) {
    const before = await db.courseCertificate.findUnique({
      where: {
        courseId_studentId: {
          courseId: lesson.module.course.id,
          studentId: user.id,
        },
      },
      select: { id: true },
    });
    const issued = await issueCertificateIfEligible(lesson.module.course.id, user.id);
    certificateIssued = Boolean(issued) && !before;
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/courses");
  revalidatePath(`/dashboard/courses/${lesson.module.course.id}`);
  revalidatePath(`/courses/${lesson.module.course.slug}`);
  return ok({ completed: true, certificateIssued });
}
