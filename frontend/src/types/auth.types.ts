export type UserRole = "ADMIN" | "ORGANIZER" | "PHOTOGRAPHER" | "GUEST";

export interface User {
  id: number;
  full_name: string;
  email: string;
  mobile_number: string;
  role: UserRole;
  is_verified: boolean;
  is_active: boolean;
  profile_image?: string;
}

export interface RegisterPayload {
  full_name: string;
  email: string;
  mobile_number: string;
  password: string;
  password_confirm: string;
  // Optional - backend defaults to ORGANIZER when omitted. Only
  // ORGANIZER and PHOTOGRAPHER may be self-selected at registration
  // (ADMIN/GUEST are rejected server-side).
  role?: "ORGANIZER" | "PHOTOGRAPHER";
}

export interface LoginPayload {
  mobile_number: string;
  password: string;
}

export interface VerifyMobilePayload {
  mobile_number: string;
  code: string;
}

export interface ResendOtpPayload {
  mobile_number: string;
}

export interface VerifyMobileResult {
  id?: number;
  mobile_number?: string;
  is_verified?: boolean;
}

export interface ForgotPasswordPayload {
  // Email address or mobile number.
  identifier: string;
}

export interface ResetPasswordPayload {
  identifier: string;
  code: string;
  new_password: string;
  new_password_confirm: string;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
  new_password_confirm: string;
}

export interface UpdateProfilePayload {
  full_name?: string;
  profile_image?: File;
}

export interface CooldownResult {
  cooldown_seconds?: number;
}