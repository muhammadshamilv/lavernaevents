import { apiClient } from "./client";
import type { ApiResponse } from "@/types/api.types";
import type {
  CreateCheckoutSessionResponse,
  CreateTopupCheckoutSessionResponse,
  Payment,
  PaymentHistoryItem,
  TopupPurchase,
} from "@/types/payment.types";

export async function createCheckoutSession(
  planSlug: string
): Promise<CreateCheckoutSessionResponse> {
  const { data } = await apiClient.post<ApiResponse<CreateCheckoutSessionResponse>>(
    "/payments/create-checkout-session/",
    { plan_slug: planSlug }
  );
  return data.data;
}

export async function getPaymentStatus(sessionId: string): Promise<Payment> {
  const { data } = await apiClient.get<ApiResponse<Payment>>(
    `/payments/status/${sessionId}/`
  );
  return data.data;
}

export async function createTopupCheckoutSession(
  packId: number
): Promise<CreateTopupCheckoutSessionResponse> {
  const { data } = await apiClient.post<ApiResponse<CreateTopupCheckoutSessionResponse>>(
    "/payments/topup/create-checkout-session/",
    { pack_id: packId }
  );
  return data.data;
}

export async function getTopupPurchaseStatus(sessionId: string): Promise<TopupPurchase> {
  const { data } = await apiClient.get<ApiResponse<TopupPurchase>>(
    `/payments/topup/status/${sessionId}/`
  );
  return data.data;
}

export async function getPaymentHistory(): Promise<PaymentHistoryItem[]> {
  const { data } = await apiClient.get<ApiResponse<PaymentHistoryItem[]>>(
    "/payments/history/"
  );
  return data.data;
}