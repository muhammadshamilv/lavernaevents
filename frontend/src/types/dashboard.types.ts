// Field names here must match dashboard/serializers.py exactly.
// OrganizerOverview (all events) uses total_accepted / total_expected_attendance;
// EventDashboardStats (one event) uses accepted_count / expected_attendance -
// different serializers, same underlying concepts.
export interface OrganizerOverview {
  total_events: number;
  total_guests: number;
  total_accepted: number;
  total_expected_attendance: number;
}

export interface EventDashboardStats {
  total_guests: number;
  accepted_count: number;
  rejected_count: number;
  maybe_count: number;
  pending_count: number;
  /** Share of guests who answered, 0 - 1. */
  response_rate: number;
  invitations_sent: number;
  invitations_not_sent: number;
  invitations_failed: number;
  notifications_sent: number;
  whatsapp_sent_count: number;
  email_sent_count: number;
  sms_sent_count: number;
  voice_call_sent_count: number;
  expected_attendance: number;
}

// --------------------------------------------------
// Invitation-focused dashboard
// --------------------------------------------------

export type InvitationChannelKey = "WHATSAPP" | "EMAIL" | "SMS" | "VOICE_CALL";

export interface ChannelTotals {
  sent: number;
  failed: number;
}

export type ChannelPerformance = Record<InvitationChannelKey, ChannelTotals>;

export interface EventNeedingAttention {
  event_id: number;
  event_name: string;
  event_date: string;
  /** Guests already invited (not everyone on the list). */
  total_guests: number;
  /** Invited guests who have not answered. */
  pending_count: number;
  pending_rate: number;
  pending_whatsapp_reminders: number;
}

export interface QuotaUsage {
  plan_name: string;
  invitations_used: number;
  invitations_total: number | null;
  invitations_remaining: number | null;
  voice_calls_used: number;
  voice_calls_total: number | null;
  voice_calls_remaining: number | null;
  expires_at: string | null;
}

export interface OrganizerInvitationOverview extends OrganizerOverview {
  pending_whatsapp_reminders: number;
  channel_performance: ChannelPerformance;
  events_needing_attention: EventNeedingAttention[];
  quota_usage: QuotaUsage | null;
  generated_at: string;
}