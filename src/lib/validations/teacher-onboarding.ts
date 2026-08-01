import { z } from "zod";
import { isValidIanaTimeZone } from "@/lib/timezone-validation";

import { LESSON_CURRENCIES } from "@/lib/currencies";
import { isHttpsUrl } from "@/lib/security/urls";

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

const currentYear = new Date().getFullYear();
const lessonCurrencyCodes = LESSON_CURRENCIES.map((item) => item.code) as [
  (typeof LESSON_CURRENCIES)[number]["code"],
  ...(typeof LESSON_CURRENCIES)[number]["code"][],
];

export const teacherOnboardingSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(100),
  // INT-02: this accepted free text while student settings enforced an allowlist — two
  // opposite contracts on the same column. Both now use the runtime IANA list.
  timezone: z
    .string()
    .trim()
    .refine(isValidIanaTimeZone, "Select a valid timezone"),
  avatarUrl: z.url("Upload a profile photo"),
  headline: z.string().trim().min(10, "Headline must be at least 10 characters").max(120),
  bio: z
    .string()
    .trim()
    .refine((value) => wordCount(value) >= 100, "Biography must be at least 100 words")
    .refine((value) => wordCount(value) <= 500, "Biography must be at most 500 words"),
  hourlyRate: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "Enter a valid hourly rate")
    .refine((value) => Number(value) > 0, "Enter an hourly rate greater than 0"),
  currency: z.enum(lessonCurrencyCodes, { message: "Select a lesson currency" }),
  // Empty allowed for grandfathered approved profiles; save/submit enforce when required.
  introVideoUrl: z.union([z.literal(""), z.url("Upload an introduction video")]),
  introVideoPath: z.string().trim().max(500),
  subjectIds: z.array(z.uuid()).min(1, "Select at least one subject").max(3),
  subjectSpecialties: z.record(z.uuid(), z.array(z.string().trim().min(1).max(80)).max(8)),
  qualifications: z
    .array(
      z.object({
        title: z.string().trim().min(3, "Enter the qualification title").max(150),
        institution: z.string().trim().min(2, "Enter the institution").max(150),
        issuedYear: z
          .string()
          .regex(/^\d{4}$/, "Enter a four-digit year")
          .refine(
            (value) => Number(value) >= 1950 && Number(value) <= currentYear,
            `Year must be between 1950 and ${currentYear}`,
          ),
        // SEC-10: z.url() accepts javascript: and data: URLs, and this value is stored
        // verbatim and rendered as an href. Require https.
        credentialUrl: z.union([
          z.literal(""),
          z
            .url("Upload a credential file or enter a valid URL")
            .refine(isHttpsUrl, "Credential links must start with https://"),
        ]),
      }),
    )
    .min(1, "Add at least one qualification")
    .max(10),
});

export type TeacherOnboardingInput = z.infer<typeof teacherOnboardingSchema>;

export const INTRO_VIDEO_MAX_BYTES = 80 * 1024 * 1024;
export const INTRO_VIDEO_MIN_SECONDS = 30;
export const INTRO_VIDEO_MAX_SECONDS = 120;
export const INTRO_VIDEO_BUCKET = "teacher-intros";

export const introVideoMimeTypes = ["video/mp4", "video/webm"] as const;

export const introVideoUploadRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  contentType: z.enum(introVideoMimeTypes),
  size: z
    .number()
    .int()
    .positive()
    .max(INTRO_VIDEO_MAX_BYTES, "Video must be smaller than 80 MB"),
});

export const introVideoConfirmSchema = z.object({
  path: z.string().trim().min(1).max(500),
  contentType: z.enum(introVideoMimeTypes),
});

export const avatarFileSchema = z
  .instanceof(File)
  .refine((file) => file.size > 0, "Choose an image")
  .refine((file) => file.size <= 2 * 1024 * 1024, "Image must be smaller than 2 MB")
  .refine(
    (file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type),
    "Use a JPG, PNG, or WebP image",
  );

export const credentialFileSchema = z
  .instanceof(File)
  .refine((file) => file.size > 0, "Choose a file")
  .refine((file) => file.size <= 3 * 1024 * 1024, "File must be smaller than 3 MB")
  .refine(
    (file) =>
      ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type),
    "Use a PDF, JPG, PNG, or WebP file",
  );

export const introVideoFileSchema = z
  .instanceof(File)
  .refine((file) => file.size > 0, "Choose a video")
  .refine(
    (file) => file.size <= INTRO_VIDEO_MAX_BYTES,
    "Video must be smaller than 80 MB",
  )
  .refine(
    (file) => introVideoMimeTypes.includes(file.type as (typeof introVideoMimeTypes)[number]),
    "Use an MP4 or WebM video",
  );

export function countWords(value: string): number {
  return wordCount(value);
}
