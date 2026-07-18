import { z } from "zod";

export const signInSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export type SignInInput = z.infer<typeof signInSchema>;

export const registerRoleSchema = z.enum(["student", "teacher"]);

export type RegisterRole = z.infer<typeof registerRoleSchema>;

export const signUpSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  email: z.email("Enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters"),
  role: registerRoleSchema,
});

export type SignUpInput = z.infer<typeof signUpSchema>;

export const resetPasswordSchema = z.object({
  email: z.email("Enter a valid email address"),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
