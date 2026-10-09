import { apiClient } from "./client";
import type { ApiResponse } from "@/types/api.types";
import type {
  ChangePasswordPayload,
  CooldownResult,
  ForgotPasswordPayload,
  LoginPayload,
  RegisterPayload,
  ResendOtpPayload,
  ResetPasswordPayload,
  UpdateProfilePayload,
  User,
  VerifyMobilePayload,
  VerifyMobileResult,
} from "@/types/auth.types";

export async function registerUser(payload: RegisterPayload): Promise<User> {
  const { data } = await apiClient.post<ApiResponse<User>>(
    "/auth/register/",
    payload
  );
  return data.data;
}

export async function loginUser(payload: LoginPayload): Promise<User> {
  const { data } = await apiClient.post<ApiResponse<{ user: User }>>(
    "/auth/login/",
    payload
  );
  return data.data.user;
}

export async function logoutUser(): Promise<void> {
  await apiClient.post<ApiResponse<Record<string, never>>>("/auth/logout/");
}

export async function verifyMobile(
  payload: VerifyMobilePayload
): Promise<VerifyMobileResult> {
  const { data } = await apiClient.post<ApiResponse<VerifyMobileResult>>(
    "/auth/verify-mobile/",
    payload
  );
  return data.data;
}

export async function resendOtp(payload: ResendOtpPayload): Promise<CooldownResult> {
  const { data } = await apiClient.post<ApiResponse<CooldownResult>>(
    "/auth/resend-otp/",
    payload
  );
  return data.data ?? {};
}

export async function forgotPassword(
  payload: ForgotPasswordPayload
): Promise<CooldownResult> {
  const { data } = await apiClient.post<ApiResponse<CooldownResult>>(
    "/auth/forgot-password/",
    payload
  );
  return data.data ?? {};
}

export async function resetPassword(payload: ResetPasswordPayload): Promise<void> {
  await apiClient.post<ApiResponse<Record<string, never>>>(
    "/auth/reset-password/",
    payload
  );
}

export async function changePassword(payload: ChangePasswordPayload): Promise<void> {
  await apiClient.post<ApiResponse<Record<string, never>>>(
    "/auth/change-password/",
    payload
  );
}

export async function updateProfile(payload: UpdateProfilePayload): Promise<User> {
  const form = new FormData();

  if (payload.full_name !== undefined) form.append("full_name", payload.full_name);
  if (payload.profile_image) form.append("profile_image", payload.profile_image);

  const { data } = await apiClient.patch<ApiResponse<User>>("/auth/me/", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data.data;
}

export async function getCurrentUser(): Promise<User> {
  const { data } = await apiClient.get<ApiResponse<User>>("/auth/me/");
  return data.data;
}