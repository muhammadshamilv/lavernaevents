import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  changePassword,
  forgotPassword,
  getCurrentUser,
  loginUser,
  logoutUser,
  registerUser,
  resendOtp,
  resetPassword,
  updateProfile,
  verifyMobile,
} from "@/api/auth.api";
import { authStore } from "@/stores/auth.store";
import type {
  ChangePasswordPayload,
  ForgotPasswordPayload,
  LoginPayload,
  RegisterPayload,
  ResendOtpPayload,
  ResetPasswordPayload,
  UpdateProfilePayload,
  User,
  VerifyMobilePayload,
} from "@/types/auth.types";

export const authKeys = {
  currentUser: ["auth", "current-user"] as const,
};

export function useCurrentUser() {
  // A browser that is known to be logged out (the last check said so, or the
  // person signed out) skips the /auth/me/ + /auth/refresh/ calls, which
  // would only 401 and fill the console. No hint at all (first visit) still
  // asks the server, so an existing session is never missed.
  const mayHaveSession = authStore.hasSessionHint();

  const query = useQuery<User | null>({
    queryKey: authKeys.currentUser,
    queryFn: getCurrentUser,
    enabled: mayHaveSession,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!mayHaveSession && !query.data) {
      authStore.setUser(null);
      authStore.setChecking(false);
      return;
    }

    if (query.isSuccess) {
      authStore.setUser(query.data);
      authStore.setChecking(false);
    } else if (query.isError) {
      authStore.setUser(null);
      authStore.setChecking(false);
    }
  }, [mayHaveSession, query.isSuccess, query.isError, query.data]);

  return query;
}

// Drop everything cached for the previous person (events, guests, billing ...)
// so the next account on a shared browser never sees it. The "auth" entry is
// kept: SessionBootstrap observes it for the app's whole lifetime.
function clearUserScopedCache(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== "auth",
  });
}

export function useRegisterMutation() {
  return useMutation({
    mutationFn: (payload: RegisterPayload) => registerUser(payload),
  });
}

export function useLoginMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: LoginPayload) => loginUser(payload),
    onSuccess: (user: User) => {
      clearUserScopedCache(queryClient);
      queryClient.setQueryData(authKeys.currentUser, user);
      authStore.setUser(user);
      authStore.setChecking(false);
    },
  });
}

function clearLocalSession(queryClient: ReturnType<typeof useQueryClient>) {
  // Overwrite the cached value in place rather than removeQueries() on the
  // auth key: removing it would trigger an immediate refetch (the observer in
  // SessionBootstrap stays mounted) which 401s again and can spiral.
  clearUserScopedCache(queryClient);
  queryClient.setQueryData(authKeys.currentUser, null);
  authStore.setUser(null);
  authStore.setChecking(false);
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: logoutUser,
    onSuccess: () => clearLocalSession(queryClient),
    // Sign-out always clears the LOCAL session, even if the network call
    // fails; the server call is best-effort token blacklisting.
    onError: () => clearLocalSession(queryClient),
  });
}

export function useVerifyMobileMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: VerifyMobilePayload) => verifyMobile(payload),
    // If this browser is already signed in (login -> verify), refresh the
    // stored user so is_verified flips to true before navigating on;
    // otherwise ProtectedRoute would bounce them straight back here.
    onSuccess: async () => {
      if (!authStore.getState().user) return;

      try {
        const fresh = await getCurrentUser();
        queryClient.setQueryData(authKeys.currentUser, fresh);
        authStore.setUser(fresh);
      } catch {
        // Ignore: the next /auth/me/ check will correct it.
      }
    },
  });
}

export function useResendOtpMutation() {
  return useMutation({
    mutationFn: (payload: ResendOtpPayload) => resendOtp(payload),
  });
}

export function useForgotPasswordMutation() {
  return useMutation({
    mutationFn: (payload: ForgotPasswordPayload) => forgotPassword(payload),
  });
}

export function useResetPasswordMutation() {
  return useMutation({
    mutationFn: (payload: ResetPasswordPayload) => resetPassword(payload),
  });
}

export function useChangePasswordMutation() {
  return useMutation({
    mutationFn: (payload: ChangePasswordPayload) => changePassword(payload),
  });
}

export function useUpdateProfileMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateProfilePayload) => updateProfile(payload),
    onSuccess: (user: User) => {
      queryClient.setQueryData(authKeys.currentUser, user);
      authStore.setUser(user);
    },
  });
}