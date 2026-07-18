import { z } from "zod";

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

const currentYear = new Date().getFullYear();

export const teacherOnboardingSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(100),
  timezone: z.string().trim().min(1, "Select a timezone").max(100),
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
    .refine((value) => Number(value) > 0, "Enter an hourly rate greater than $0"),
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
        credentialUrl: z.union([
          z.literal(""),
          z.url("Upload a credential file or enter a valid URL"),
        ]),
      }),
    )
    .min(1, "Add at least one qualification")
    .max(10),
});

export type TeacherOnboardingInput = z.infer<typeof teacherOnboardingSchema>;

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

export function countWords(value: string): number {
  return wordCount(value);
}
