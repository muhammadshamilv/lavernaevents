import type { UserRole } from "./auth.types";

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

// Phase 26: extended with channel_usage - the admin dashboard now also
// shows platform-wide pool health (per-channel capacity/used/remaining and
// low/exhausted flags) alongside the existing summary tiles.
export interface AdminChannelUsage {
  channel: InvitationChannelKey;
  channel_display: string;
  total_capacity: number;
  used: number;
  remaining: number;
  is_low: boolean;
  is_exhausted: boolean;
}

export interface AdminDashboardStats {
  total_users: number;
  active_events: number;
  membership_sales: number;
  revenue: number;
  storage_usage_mb: number;
  channel_usage: AdminChannelUsage[];
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

// Matches AdminUserListSerializer exactly - the model's own TimeStampedModel
// field is created_at, not date_joined.
export interface AdminUser {
  id: number;
  full_name: string;
  email: string;
  mobile_number: string;
  role: UserRole;
  is_verified: boolean;
  is_active: boolean;
  is_suspended: boolean;
  created_at: string;
}

export interface AdminUserUpdatePayload {
  full_name?: string;
  email?: string;
  mobile_number?: string;
  role?: UserRole;
  is_verified?: boolean;
  is_active?: boolean;
}

export interface AdminUsersQueryParams {
  page?: number;
  search?: string;
  role?: UserRole;
  is_suspended?: boolean;
  is_verified?: boolean;
}

// ---------------------------------------------------------------------------
// Membership Plans
// ---------------------------------------------------------------------------

export interface AdminMembershipPlan {
  id: number;
  name: string;
  slug: string;
  description: string;
  price: string;
  duration_days: number;
  // These three always have a value (the database cannot store "unlimited").
  guest_limit: number;
  event_limit: number;
  storage_limit_mb: number;
  // These can be null = unlimited.
  total_invitations: number | null;
  template_limit: number | null;
  voice_call_limit: number | null;
  gallery_enabled: boolean;
  qr_code_enabled: boolean;
  photographer_access_enabled: boolean;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface AdminMembershipPlanPayload {
  name: string;
  slug: string;
  description?: string;
  price: string;
  duration_days: number;
  guest_limit: number;
  event_limit: number;
  storage_limit_mb: number;
  total_invitations?: number | null;
  template_limit?: number | null;
  voice_call_limit?: number | null;
  gallery_enabled?: boolean;
  qr_code_enabled?: boolean;
  photographer_access_enabled?: boolean;
  is_active?: boolean;
  display_order?: number;
}

export type AdminMembershipPlanUpdatePayload = Partial<AdminMembershipPlanPayload>;

// ---------------------------------------------------------------------------
// Invitation Templates
// ---------------------------------------------------------------------------

export interface AdminInvitationTemplate {
  id: number;
  name: string;
  description: string;
  preview_image: string | null;
  background_image: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface AdminInvitationTemplatePayload {
  name: string;
  description?: string;
  is_active?: boolean;
  display_order?: number;
  preview_image?: File | null;
  background_image?: File | null;
}

export type AdminInvitationTemplateUpdatePayload = Partial<AdminInvitationTemplatePayload>;

// ---------------------------------------------------------------------------
// Gallery Media (admin-wide, cross-event)
// ---------------------------------------------------------------------------

export interface AdminGalleryMedia {
  id: number;
  event: number;
  event_name: string;
  uploaded_by_name: string | null;
  media_type: "IMAGE" | "VIDEO";
  file: string;
  thumbnail: string | null;
  caption: string;
  is_featured: boolean;
  file_size: number | null;
  created_at: string;
}

export interface AdminMediaQueryParams {
  page?: number;
  media_type?: "IMAGE" | "VIDEO";
  event?: number;
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface RevenueReportPoint {
  period: string;
  amount: number;
}

export interface RegistrationsReportPoint {
  period: string;
  count: number;
}

export interface MembershipStatistic {
  plan_name: string;
  active_subscribers: number;
}

export interface AdminReports {
  revenue_by_period: RevenueReportPoint[];
  registrations_by_period: RegistrationsReportPoint[];
  active_events_count: number;
  membership_statistics: MembershipStatistic[];
  storage_usage_mb: number;
}

// ---------------------------------------------------------------------------
// Phase 26: platform channel pools + topup packs (admin-managed)
// ---------------------------------------------------------------------------

// Matches PlatformChannelPool.Channel choices (backend/memberships/topup_models.py).
export type InvitationChannelKey = "WHATSAPP" | "EMAIL" | "SMS" | "VOICE_CALL";

// Matches PlatformChannelPoolSerializer exactly.
export interface PlatformChannelPool {
  /** null for a channel that has never been topped up. */
  id: number | null;
  channel: InvitationChannelKey;
  channel_display: string;
  total_capacity: number;
  used: number;
  remaining: number;
  low_balance_threshold: number;
  /** false = never topped up. Such a channel is UNLIMITED, not empty. */
  is_configured: boolean;
  is_low: boolean;
  is_exhausted: boolean;
  updated_at: string | null;
}

export interface PlatformPoolTopupPayload {
  channel: InvitationChannelKey;
  amount: number;
  note?: string;
  low_balance_threshold?: number;
}

// Matches PlatformPoolTopupSerializer exactly.
export interface PlatformPoolTopup {
  id: number;
  channel: InvitationChannelKey;
  channel_display: string;
  amount: number;
  note: string;
  topped_up_by_name: string | null;
  created_at: string;
}

// Matches TopupPack.Kind choices (backend/memberships/topup_models.py).
export type TopupPackKind = "INVITATIONS" | "VOICE_CALLS";

// Matches AdminTopupPackSerializer exactly.
export interface AdminTopupPack {
  id: number;
  name: string;
  kind: TopupPackKind;
  quantity: number;
  price: string;
  is_active: boolean;
  display_order: number;
}

export interface AdminTopupPackPayload {
  name: string;
  kind: TopupPackKind;
  quantity: number;
  price: string;
  is_active?: boolean;
  display_order?: number;
}

export type AdminTopupPackUpdatePayload = Partial<AdminTopupPackPayload>;
