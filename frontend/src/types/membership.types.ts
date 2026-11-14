export interface MembershipPlan {
  id: number;
  name: string;
  slug: string;
  description: string;
  price: string;
  duration_days: number;
  guest_limit: number;
  event_limit: number;
  total_invitations: number | null;
  template_limit: number | null;
  voice_call_limit: number | null;
  storage_limit_mb: number;
  gallery_enabled: boolean;
  qr_code_enabled: boolean;
  photographer_access_enabled: boolean;
  display_order: number;
}

export type SubscriptionStatus = "ACTIVE" | "EXPIRED" | "CANCELLED";

export interface Subscription {
  id: number;
  plan: MembershipPlan;
  status: SubscriptionStatus;
  invitations_used: number;
  // Phase 26: how much of invitations_remaining came from a topup purchase
  // on top of the plan's own total_invitations.
  invitations_topup: number;
  invitations_remaining: number | null;
  voice_calls_used: number;
  voice_calls_topup: number;
  voice_calls_remaining: number | null;
  started_at: string;
  expires_at: string;
  cancelled_at: string | null;
}

export interface UsageSummary {
  plan_name: string;
  has_active_plan: boolean;
  guest_limit: number | null;
  event_limit: number | null;

  template_limit: number | null;
  template_count: number | null;
  template_remaining: number | null;

  storage_limit_mb: number | null;

  total_invitations: number | null;
  invitations_used: number | null;
  // Phase 26
  invitations_topup: number | null;
  invitations_remaining: number | null;

  voice_call_limit: number | null;
  voice_calls_used: number | null;
  // Phase 26
  voice_calls_topup: number | null;
  voice_calls_remaining: number | null;

  gallery_enabled: boolean;
  qr_code_enabled: boolean;
  photographer_access_enabled: boolean;
}

export type PortalNextStep = "verify_mobile" | "select_plan" | null;

/** The plan that most recently ran out (sent when next_step is "select_plan"). */
export interface ExpiredSubscription {
  plan_name: string;
  plan_slug: string;
  expired_at: string;
}

export interface PortalAccess {
  can_access_portal: boolean;
  next_step: PortalNextStep;
  plan_expired: boolean;
  expired_subscription: ExpiredSubscription | null;
}

export type PlanChangeType = "upgrade" | "downgrade" | "same";

export interface ChangePlanResult {
  change_type: PlanChangeType;
  subscription: Subscription;
}

// ---------------------------------------------------------------------------
// Phase 26: organizer-facing topup packs
// ---------------------------------------------------------------------------

export type TopupPackKind = "INVITATIONS" | "VOICE_CALLS";

// Matches TopupPackSerializer exactly (backend/memberships/serializers.py).
export interface TopupPack {
  id: number;
  name: string;
  kind: TopupPackKind;
  quantity: number;
  price: string;
  display_order: number;
}