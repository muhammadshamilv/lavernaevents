export type PaymentStatus = "CREATED" | "PAID" | "FAILED";

export interface Payment {
  id: number;
  plan_name: string;
  stripe_checkout_session_id: string;
  amount: string;
  currency: string;
  status: PaymentStatus;
  created_at: string;
}

export interface CreateCheckoutSessionResponse {
  checkout_url: string;
  stripe_checkout_session_id: string;
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
  stripe_checkout_session_id: string;
  amount: string;
  status: PaymentStatus;
  created_at: string;
}

// CreateTopupCheckoutSessionView returns the same checkout_url shape as the
// plan checkout - both wrap stripe.checkout.Session.create identically.
export interface CreateTopupCheckoutSessionResponse {
  checkout_url: string;
  stripe_checkout_session_id: string;
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