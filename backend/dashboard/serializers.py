from rest_framework import serializers


class EventDashboardSerializer(serializers.Serializer):
    """Serializer for a single event's dashboard statistics."""

    total_guests = serializers.IntegerField()
    accepted_count = serializers.IntegerField()
    rejected_count = serializers.IntegerField()
    maybe_count = serializers.IntegerField()
    pending_count = serializers.IntegerField()
    # Share of guests who have answered, 0.0 - 1.0.
    response_rate = serializers.FloatField()
    invitations_sent = serializers.IntegerField()
    invitations_not_sent = serializers.IntegerField()
    invitations_failed = serializers.IntegerField()
    notifications_sent = serializers.IntegerField()
    whatsapp_sent_count = serializers.IntegerField()
    email_sent_count = serializers.IntegerField()
    sms_sent_count = serializers.IntegerField()
    voice_call_sent_count = serializers.IntegerField()
    expected_attendance = serializers.IntegerField()


class ChartDataPointSerializer(serializers.Serializer):
    """Serializer for a single chart data point (Recharts-friendly)."""

    name = serializers.CharField()
    value = serializers.IntegerField()


class OrganizerOverviewSerializer(serializers.Serializer):
    """Serializer for the organizer's overview across all their events."""

    total_events = serializers.IntegerField()
    total_guests = serializers.IntegerField()
    total_accepted = serializers.IntegerField()
    total_expected_attendance = serializers.IntegerField()


class ChannelTotalsSerializer(serializers.Serializer):
    sent = serializers.IntegerField()
    failed = serializers.IntegerField()


class EventNeedingAttentionSerializer(serializers.Serializer):
    event_id = serializers.IntegerField()
    event_name = serializers.CharField()
    event_date = serializers.DateField()
    # Both counts are for guests who were already invited.
    total_guests = serializers.IntegerField()
    pending_count = serializers.IntegerField()
    pending_rate = serializers.FloatField()
    pending_whatsapp_reminders = serializers.IntegerField()


class QuotaUsageSerializer(serializers.Serializer):
    plan_name = serializers.CharField()
    invitations_used = serializers.IntegerField()
    invitations_total = serializers.IntegerField(allow_null=True)
    invitations_remaining = serializers.IntegerField(allow_null=True)
    voice_calls_used = serializers.IntegerField()
    voice_calls_total = serializers.IntegerField(allow_null=True)
    voice_calls_remaining = serializers.IntegerField(allow_null=True)
    expires_at = serializers.DateTimeField(allow_null=True)


class OrganizerInvitationOverviewSerializer(serializers.Serializer):
    """Serializer for the full dashboard payload."""

    total_events = serializers.IntegerField()
    total_guests = serializers.IntegerField()
    total_accepted = serializers.IntegerField()
    total_expected_attendance = serializers.IntegerField()
    pending_whatsapp_reminders = serializers.IntegerField()
    channel_performance = serializers.DictField(child=ChannelTotalsSerializer())
    events_needing_attention = EventNeedingAttentionSerializer(many=True)
    quota_usage = QuotaUsageSerializer(allow_null=True)
    generated_at = serializers.DateTimeField()