export type PaymentStatus = "CREATED" | "PAID" | "FAILED";

export interface Payment {
  id: number;
  plan_name: string;
  order_id: string;
  amount: string;
  currency: string;
  status: PaymentStatus;
  created_at: string;
}

// Returned when a Cashfree order is created; passed to startCashfreeCheckout().
export interface CreateCheckoutSessionResponse {
  order_id: string;
  payment_session_id: string;
  cashfree_mode: "sandbox" | "production";
}

// ---------------------------------------------------------------------------
// Organizer topup pack purchases
// ---------------------------------------------------------------------------

export type TopupPackKind = "INVITATIONS" | "VOICE_CALLS";

// Matches TopupPurchaseSerializer exactly (backend/payments/serializers.py).
export interface TopupPurchase {
  id: number;
  pack_name: string;
  pack_kind: TopupPackKind;
  pack_quantity: number;
  order_id: string;
  amount: string;
  status: PaymentStatus;
  created_at: string;
}

// CreateTopupCheckoutSessionView returns the same shape as the plan checkout.
export interface CreateTopupCheckoutSessionResponse {
  order_id: string;
  payment_session_id: string;
  cashfree_mode: "sandbox" | "production";
}

// ---------------------------------------------------------------------------
// Billing history (GET /payments/history/)
// ---------------------------------------------------------------------------

export interface PaymentHistoryItem {
  id: string;
  kind: "PLAN" | "TOPUP";
  description: string;
  amount: string;
  currency: string;
  status: PaymentStatus;
  created_at: string;
}