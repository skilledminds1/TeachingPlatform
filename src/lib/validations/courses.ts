import { z } from "zod";

import { LESSON_CURRENCIES } from "@/lib/currencies";
import { normalizeVideoEmbedUrl } from "@/lib/security/urls";

const currencyCodes = LESSON_CURRENCIES.map((item) => item.code) as [
  (typeof LESSON_CURRENCIES)[number]["code"],
  ...(typeof LESSON_CURRENCIES)[number]["code"][],
];

export const courseLevelSchema = z.enum([
  "beginner",
  "intermediate",
  "advanced",
  "all_levels",
]);

export const courseCurrencySchema = z.enum(currencyCodes, {
  message: "Select a supported currency",
});

const optionalSubjectIdSchema = z
  .union([z.uuid("Select a valid subject"), z.literal(""), z.null()])
  .optional()
  .transform((value) => value || null);

export const COURSE_MEDIA_BUCKET = "course-media";
export const COURSE_VIDEO_MAX_BYTES = 500 * 1024 * 1024;
export const COURSE_RESOURCE_MAX_BYTES = 80 * 1024 * 1024;

export const courseVideoMimeTypes = ["video/mp4", "video/webm"] as const;
export const courseResourceMimeTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "application/x-zip-compressed",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const createCourseSchema = z.object({
  title: z.string().trim().min(2, "Enter a course title").max(150),
  description: z.string().trim().max(10_000).default(""),
  subjectId: optionalSubjectIdSchema,
  priceCents: z.coerce.number().int().min(0, "Price cannot be negative").default(0),
  currency: courseCurrencySchema.default("USD"),
  level: courseLevelSchema.default("all_levels"),
});

export const updateCourseSchema = z.object({
  courseId: z.uuid("Invalid course"),
  title: z.string().trim().min(2, "Enter a course title").max(150).optional(),
  description: z.string().trim().max(10_000).optional(),
  subjectId: optionalSubjectIdSchema,
  priceCents: z.coerce.number().int().min(0, "Price cannot be negative").optional(),
  currency: courseCurrencySchema.optional(),
  level: courseLevelSchema.optional(),
  certificateEnabled: z.boolean().optional(),
});

export const createModuleSchema = z.object({
  courseId: z.uuid("Invalid course"),
  title: z.string().trim().min(1, "Enter a module title").max(150),
});

export const updateModuleSchema = z.object({
  moduleId: z.uuid("Invalid module"),
  title: z.string().trim().min(1, "Enter a module title").max(150),
});

export const createLessonSchema = z.object({
  moduleId: z.uuid("Invalid module"),
  title: z.string().trim().min(1, "Enter a lesson title").max(150),
  content: z.string().trim().max(100_000).default(""),
  // SEC-08: z.url() accepts javascript: and data: URLs, and this value is rendered as an
  // iframe src — including on the unauthenticated public course sales page for preview
  // lessons. Constrain to https on an allowlisted embed host, normalising the share URLs
  // teachers actually paste.
  videoUrl: z
    .union([z.string().trim(), z.literal(""), z.null()])
    .optional()
    .transform((value) => (value ? value.trim() : null))
    .refine(
      (value) => value === null || normalizeVideoEmbedUrl(value) !== null,
      "Paste a YouTube, Vimeo or Loom video link",
    )
    .transform((value) => (value ? normalizeVideoEmbedUrl(value) : null)),
});

export const updateLessonSchema = createLessonSchema
  .omit({ moduleId: true })
  .partial()
  .extend({ lessonId: z.uuid("Invalid lesson"), isPreview: z.boolean().optional() });

export const courseIdSchema = z.object({ courseId: z.uuid("Invalid course") });
export const moduleIdSchema = z.object({ moduleId: z.uuid("Invalid module") });
export const lessonIdSchema = z.object({ lessonId: z.uuid("Invalid lesson") });
export const assetIdSchema = z.object({ assetId: z.uuid("Invalid asset") });

export const reorderModulesSchema = z.object({
  courseId: z.uuid("Invalid course"),
  moduleIds: z.array(z.uuid("Invalid module")).min(1).max(100),
});

export const reorderLessonsSchema = z.object({
  moduleId: z.uuid("Invalid module"),
  lessonIds: z.array(z.uuid("Invalid lesson")).min(1).max(500),
});

export const courseCoverFileSchema = z
  .instanceof(File)
  .refine((file) => file.size > 0, "Choose an image")
  .refine((file) => file.size <= 5 * 1024 * 1024, "Image must be smaller than 5 MB")
  .refine(
    (file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type),
    "Use a JPG, PNG, or WebP image",
  );

// SEC-09: every other upload path (avatars, credentials, intro videos, course media)
// validates the declared MIME type against an allowlist AND checks the binary magic bytes.
// This one previously accepted anything -- so .exe, .hta, .svg or .html payloads could be
// stored and handed to paying students through the signed-URL download route.
export const lessonFileSchema = z
  .instanceof(File)
  .refine((file) => file.size > 0, "Choose a file")
  .refine((file) => file.size <= COURSE_RESOURCE_MAX_BYTES, "File must be smaller than 80 MB")
  .refine(
    (file) => (courseResourceMimeTypes as readonly string[]).includes(file.type),
    "Use a PDF, image, Office document, or plain-text file",
  );

export const courseMediaUploadRequestSchema = z.object({
  lessonId: z.uuid("Invalid lesson"),
  kind: z.enum(["video", "resource"]),
  fileName: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(1).max(120),
  size: z.number().int().positive(),
});

export const courseMediaConfirmSchema = z.object({
  lessonId: z.uuid("Invalid lesson"),
  kind: z.enum(["video", "resource"]),
  path: z.string().trim().min(1).max(500),
  contentType: z.string().trim().min(1).max(120),
  fileName: z.string().trim().min(1).max(200),
  size: z.number().int().positive(),
});

export const rejectCourseSchema = z.object({
  courseId: z.uuid("Invalid course"),
  reason: z.string().trim().min(5, "Provide a rejection reason").max(500),
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type CreateModuleInput = z.infer<typeof createModuleSchema>;
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>;
export type CreateLessonInput = z.infer<typeof createLessonSchema>;
export type UpdateLessonInput = z.infer<typeof updateLessonSchema>;
