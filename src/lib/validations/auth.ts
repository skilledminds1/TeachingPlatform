import { z } from "zod";

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
  confirmedAdult: z.boolean().refine(Boolean, "You must confirm that you are at least 18"),
  acceptedTerms: z.boolean().refine(Boolean, "You must accept the Terms of Service"),
  acceptedPrivacy: z.boolean().refine(Boolean, "You must acknowledge the Privacy Policy"),
  acceptedRefundPolicy: z
    .boolean()
    .refine(Boolean, "You must accept the Refund and Direct Payment Policy"),
  acceptedTeacherAgreement: z.boolean(),
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
  })
  .and(legalAcceptanceInputSchema)
  .refine(
    (value) => value.role !== "teacher" || value.acceptedTeacherAgreement,
    {
      path: ["acceptedTeacherAgreement"],
      message: "Teachers must accept the Teacher Agreement",
    },
  );

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
