import { z } from "zod";

// Accepts 9876543210, +91 98765 43210, 098765-43210 ... Spaces, dashes,
// dots and brackets are removed; the backend turns every spelling of the
// same number into one canonical form.
const cleanMobile = (value: string) => value.replace(/[\s\-().]/g, "");
const MOBILE_PATTERN = /^\+?\d{10,15}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const mobileField = z
  .string()
  .trim()
  .transform(cleanMobile)
  .refine(
    (value) => MOBILE_PATTERN.test(value),
    "Enter a valid mobile number (10-15 digits, +91 is fine)."
  );

export const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .refine((value) => !/^\d+$/.test(value), "Password cannot be only numbers.");

// Email address OR mobile number (forgot / reset password).
export const identifierField = z
  .string()
  .trim()
  .min(1, "Enter your email or mobile number.")
  .transform((value) =>
    value.includes("@") ? value.toLowerCase() : cleanMobile(value)
  )
  .refine(
    (value) =>
      value.includes("@") ? EMAIL_PATTERN.test(value) : MOBILE_PATTERN.test(value),
    "Enter a valid email address or mobile number."
  );

export const otpCodeField = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code.");

export const registerSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(2, "Full name must be at least 2 characters."),
    email: z.string().trim().toLowerCase().email("Enter a valid email address."),
    mobile_number: mobileField,
    password: passwordField,
    password_confirm: z.string().min(1, "Please confirm your password."),
    role: z.enum(["ORGANIZER", "PHOTOGRAPHER"]),
  })
  .refine((data) => data.password === data.password_confirm, {
    message: "Passwords do not match.",
    path: ["password_confirm"],
  });

export type RegisterFormValues = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  mobile_number: mobileField,
  password: z.string().min(1, "Password is required."),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const verifyMobileSchema = z.object({
  mobile_number: mobileField,
  code: otpCodeField,
});

export type VerifyMobileFormValues = z.infer<typeof verifyMobileSchema>;

export const forgotPasswordSchema = z.object({
  identifier: identifierField,
});

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    identifier: identifierField,
    code: otpCodeField,
    new_password: passwordField,
    new_password_confirm: z.string().min(1, "Please confirm your password."),
  })
  .refine((data) => data.new_password === data.new_password_confirm, {
    message: "Passwords do not match.",
    path: ["new_password_confirm"],
  });

export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "Enter your current password."),
    new_password: passwordField,
    new_password_confirm: z.string().min(1, "Please confirm your password."),
  })
  .refine((data) => data.new_password === data.new_password_confirm, {
    message: "Passwords do not match.",
    path: ["new_password_confirm"],
  })
  .refine((data) => data.new_password !== data.current_password, {
    message: "The new password must be different from the current one.",
    path: ["new_password"],
  });

export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

export const profileSchema = z.object({
  full_name: z.string().trim().min(2, "Full name must be at least 2 characters."),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;