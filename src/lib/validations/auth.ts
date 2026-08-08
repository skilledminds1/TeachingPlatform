import { z } from "zod";

import { isMinor, isPlausibleDateOfBirth } from "@/lib/age";

import { COUNTRY_CODES, type CountryCode } from "@/lib/countries";

// INT-13: a plain enum, deliberately. Whether a country is ALLOWED is a trust decision that
// belongs in the server action, where refusal can be audited — not in a schema the client
// also holds. Keeping the field free of .refine() additionally avoids the ZodEffects that
// breaks resolver typing, as documented in src/lib/validations/teacher-onboarding.ts.
const countryCodes = COUNTRY_CODES as unknown as [CountryCode, ...CountryCode[]];

export const signInSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export type SignInInput = z.infer<typeof signInSchema>;

export const registerRoleSchema = z.enum(["student", "teacher"]);

export type RegisterRole = z.infer<typeof registerRoleSchema>;

export const legalAcceptanceInputSchema = z.object({
  /// Retained on the re-acceptance path only, where no date of birth is collected. New
  /// registrations state a real date of birth instead — see dateOfBirthSchema.
  confirmedAdult: z.boolean().refine(Boolean, "You must confirm that you are at least 18"),
  acceptedTerms: z.boolean().refine(Boolean, "You must accept the Terms of Service"),
  acceptedPrivacy: z.boolean().refine(Boolean, "You must acknowledge the Privacy Policy"),
  acceptedRefundPolicy: z
    .boolean()
    .refine(Boolean, "You must accept the Refund and Direct Payment Policy"),
  acceptedTeacherAgreement: z.boolean(),
});

/**
 * A stated date of birth, replacing the "I am at least 18" checkbox.
 *
 * The checkbox asserted an age nobody verified, on a platform whose subject catalogue is a
 * school curriculum and whose marketing addresses parents. A date is not verification either,
 * but it is a statement the platform can act on: under 18 routes to guardian consent instead
 * of being silently treated as an adult.
 */
export const dateOfBirthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your date of birth")
  .refine((value) => isPlausibleDateOfBirth(new Date(`${value}T00:00:00.000Z`)), {
    message: "Enter a real date of birth",
  });

export const guardianSchema = z.object({
  guardianName: z.string().trim().min(2, "Enter your parent or guardian's name").max(100),
  guardianEmail: z
    .email("Enter your parent or guardian's email address")
    .transform((value) => value.trim().toLowerCase()),
  relationship: z
    .string()
    .trim()
    .min(2, "Say how they are related to you")
    .max(60),
});

export const signUpSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
    email: z.email("Enter a valid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password must be at most 72 characters"),
    role: registerRoleSchema,
    // INT-13: required for every new account. Country gates payout eligibility (PAY-14),
    // tax evidence (PAY-06) and the restricted-jurisdiction check.
    country: z.enum(countryCodes, { message: "Select your country" }),
    dateOfBirth: dateOfBirthSchema,
    guardian: guardianSchema.optional(),
  })
  .and(legalAcceptanceInputSchema.omit({ confirmedAdult: true }))
  .refine(
    (value) => value.role !== "teacher" || value.acceptedTeacherAgreement,
    {
      path: ["acceptedTeacherAgreement"],
      message: "Teachers must accept the Teacher Agreement",
    },
  )
  // A minor cannot be the teacher. The teacher is the merchant of record for their own
  // lessons, contracts directly with students, and carries the tax position — none of which a
  // child can be bound to. This is a capacity limit, not a safeguarding one.
  .refine(
    (value) =>
      value.role !== "teacher" ||
      !isMinorFromInput(value.dateOfBirth),
    {
      path: ["dateOfBirth"],
      message: "Teachers must be at least 18. You can register as a student instead.",
    },
  )
  .refine(
    (value) => !isMinorFromInput(value.dateOfBirth) || Boolean(value.guardian),
    {
      path: ["guardian"],
      message: "Under 18s need a parent or guardian's details",
    },
  );

function isMinorFromInput(dateOfBirth: string): boolean {
  return isMinor(new Date(`${dateOfBirth}T00:00:00.000Z`)) === true;
}

export type SignUpInput = z.infer<typeof signUpSchema>;

export const resetPasswordSchema = z.object({
  email: z.email("Enter a valid email address"),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

const newPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters");

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: newPasswordSchema,
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    path: ["newPassword"],
    message: "New password must be different from your current password",
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const updateRecoveredPasswordSchema = z
  .object({
    newPassword: newPasswordSchema,
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export type UpdateRecoveredPasswordInput = z.infer<
  typeof updateRecoveredPasswordSchema
>;
