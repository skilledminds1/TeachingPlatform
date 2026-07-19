"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  courseCoverFileSchema,
  courseIdSchema,
  createCourseSchema,
  createLessonSchema,
  createModuleSchema,
  lessonFileSchema,
  lessonIdSchema,
  moduleIdSchema,
  reorderLessonsSchema,
  reorderModulesSchema,
  updateCourseSchema,
  updateLessonSchema,
  updateModuleSchema,
} from "@/lib/validations/courses";
import { requireAuth } from "@/server/auth/session";
import {
  assertCourseOwnership,
  canPublishCourse,
  getCourseUsage,
  getTeacherCourseContext,
} from "@/server/courses/access";
import { getLessonDownloadAccess } from "@/server/courses/queries";
import { fail, ok, type ActionResult } from "@/types/action";
import { slugify } from "@/utils/slugify";

function validationFailure(message?: string) {
  return fail(message ?? "Invalid course data.", "VALIDATION_ERROR");
}

const COURSE_AUTHORING_PLANS = new Set(["professional", "business"]);

async function courseAuthoringPlanFailure(
  userId: string,
): Promise<ReturnType<typeof fail> | null> {
  const context = await getTeacherCourseContext(userId);
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
  if (courseId) revalidatePath(`/dashboard/teacher/courses/${courseId}`);
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
  const context = await getTeacherCourseContext(user.id);
  if (!COURSE_AUTHORING_PLANS.has(context.plan.slug)) {
    return fail(
      "Course creation and uploads require a Professional or Business subscription.",
      "PLAN_LIMIT_EXCEEDED",
    );
  }
  const usage = await getCourseUsage(context.organization.id);
  if (usage.atLimit) {
    return fail(
      `Your ${usage.plan.name} plan allows ${usage.limit} course${
        usage.limit === 1 ? "" : "s"
      }. Upgrade your plan to create another course.`,
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

  const { courseId, ...data } = parsed.data;
  await db.course.update({ where: { id: courseId }, data });
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

export async function publishCourse(
  input: unknown,
): Promise<ActionResult<{ published: true }>> {
  const parsed = courseIdSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message);
  const user = await requireAuth();
  const planFailure = await courseAuthoringPlanFailure(user.id);
  if (planFailure) return planFailure;
  const course = await assertCourseOwnership(parsed.data.courseId, user.id);
  const readiness = await canPublishCourse(course.id, user.id);
  if (!readiness.allowed) {
    return fail(readiness.reasons[0] ?? "Course is not ready to publish.", "VALIDATION_ERROR");
  }
  await db.course.update({
    where: { id: course.id },
    data: { status: "published", publishedAt: new Date() },
  });
  revalidateCoursePaths(course.id, course.slug);
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

export async function uploadLessonFile(
  formData: FormData,
): Promise<ActionResult<{ fileName: string }>> {
  const lessonId = formData.get("lessonId");
  const parsedId = lessonIdSchema.safeParse({ lessonId });
  const parsedFile = lessonFileSchema.safeParse(formData.get("file"));
  if (!parsedId.success) return validationFailure(parsedId.error.issues[0]?.message);
  if (!parsedFile.success) return validationFailure(parsedFile.error.issues[0]?.message);
  const user = await requireAuth();
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
  const supabase = createAdminClient();
  const { error } = await supabase.storage.from("course-files").upload(path, bytes, {
    contentType: parsedFile.data.type || "application/octet-stream",
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
      fileMimeType: parsedFile.data.type || "application/octet-stream",
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
  const user = await requireAuth();
  const access = await getLessonDownloadAccess(parsed.data.lessonId, user.id);
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
): Promise<ActionResult<{ completed: true }>> {
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
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/courses");
  revalidatePath(`/dashboard/courses/${lesson.module.course.id}`);
  revalidatePath(`/courses/${lesson.module.course.slug}`);
  return ok({ completed: true });
}
