import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCheckoutSession,
  createTopupCheckoutSession,
  getPaymentHistory,
  getPaymentStatus,
  getTopupPurchaseStatus,
} from "@/api/payments.api";
import { useAuthStore } from "@/stores/auth.store";
import { membershipKeys } from "./useMembershipQueries";
import type { Payment, PaymentStatus, TopupPurchase } from "@/types/payment.types";

export const paymentKeys = {
  history: ["payments", "history"] as const,
};

export function useCreateCheckoutSessionMutation() {
  return useMutation({
    mutationFn: (planSlug: string) => createCheckoutSession(planSlug),
  });
}

export function useCreateTopupCheckoutSessionMutation() {
  return useMutation({
    mutationFn: (packId: number) => createTopupCheckoutSession(packId),
  });
}

export function usePaymentHistory() {
  const { user } = useAuthStore();

  return useQuery({
    queryKey: paymentKeys.history,
    queryFn: getPaymentHistory,
    enabled: !!user,
  });
}

const POLL_INTERVAL_MS = 2000;
// 15 tries x 2 s = 30 s. The backend also asks Stripe directly on every
// poll, so a slow or missing webhook no longer leaves the page waiting.
const MAX_ATTEMPTS = 15;

interface PollingResult<T> {
  data: T | null;
  isPolling: boolean;
  hasTimedOut: boolean;
}

function useStatusPolling<T extends { status: PaymentStatus }>(
  queryKey: readonly unknown[],
  fetcher: (sessionId: string) => Promise<T>,
  sessionId: string | undefined
): PollingResult<T> {
  const queryClient = useQueryClient();
  const [attempts, setAttempts] = useState(0);

  const query = useQuery<T>({
    queryKey,
    queryFn: async () => {
      try {
        return await fetcher(sessionId as string);
      } finally {
        // Counted on errors too, so a 404 can never poll forever.
        setAttempts((prev) => prev + 1);
      }
    },
    enabled: !!sessionId,
    retry: false,
    refetchInterval: (currentQuery) => {
      const currentStatus = currentQuery.state.data?.status;
      const settled = currentStatus === "PAID" || currentStatus === "FAILED";

      return settled || attempts >= MAX_ATTEMPTS ? false : POLL_INTERVAL_MS;
    },
  });

  const status = query.data?.status;

  // Once paid, throw away anything cached about the plan/usage. A cached
  // "select_plan" answer would otherwise bounce the user straight back to
  // /pricing when they continue to the portal.
  useEffect(() => {
    if (status !== "PAID") return;

    queryClient.removeQueries({ queryKey: membershipKeys.portalAccess });
    queryClient.invalidateQueries({ queryKey: membershipKeys.mySubscription });
    queryClient.invalidateQueries({ queryKey: membershipKeys.myUsage });
    queryClient.invalidateQueries({ queryKey: paymentKeys.history });
  }, [status, queryClient]);

  const settled = status === "PAID" || status === "FAILED";
  const hasTimedOut = !!sessionId && !settled && attempts >= MAX_ATTEMPTS;

  return {
    data: query.data ?? null,
    isPolling: !!sessionId && !settled && !hasTimedOut,
    hasTimedOut,
  };
}

interface PaymentStatusPollingResult {
  payment: Payment | null;
  isPolling: boolean;
  hasTimedOut: boolean;
}

export function usePaymentStatusPolling(
  sessionId: string | undefined
): PaymentStatusPollingResult {
  const { data, isPolling, hasTimedOut } = useStatusPolling<Payment>(
    ["payments", "status", sessionId],
    getPaymentStatus,
    sessionId
  );

  return { payment: data, isPolling, hasTimedOut };
}

interface TopupPurchaseStatusPollingResult {
  purchase: TopupPurchase | null;
  isPolling: boolean;
  hasTimedOut: boolean;
}

export function useTopupPurchaseStatusPolling(
  sessionId: string | undefined
): TopupPurchaseStatusPollingResult {
  const { data, isPolling, hasTimedOut } = useStatusPolling<TopupPurchase>(
    ["payments", "topup-status", sessionId],
    getTopupPurchaseStatus,
    sessionId
  );

  return { purchase: data, isPolling, hasTimedOut };
}