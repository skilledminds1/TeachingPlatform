import { z } from "zod";

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
