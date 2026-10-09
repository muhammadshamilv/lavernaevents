from rest_framework import serializers


class InvitationPublicSerializer(serializers.Serializer):
    """Serializer for the public-facing invitation details shown on the response page.

    Deliberately exposes ONLY what a guest needs to see -- no organizer
    contact info, no internal IDs beyond what's needed, no other guests'
    data. This is a public, unauthenticated endpoint.
    """

    guest_name = serializers.CharField()
    event_name = serializers.CharField()
    event_type = serializers.CharField()
    event_type_label = serializers.CharField()
    host_name = serializers.CharField(allow_blank=True)
    description = serializers.CharField(allow_blank=True)
    event_date = serializers.DateField()
    event_time = serializers.TimeField()
    event_end_time = serializers.TimeField(allow_null=True)
    time_text = serializers.CharField()
    venue_name = serializers.CharField(allow_blank=True)
    address = serializers.CharField(allow_blank=True)
    google_maps_link = serializers.CharField(allow_blank=True)
    cover_image = serializers.CharField(allow_null=True)
    invitation_image = serializers.CharField(allow_null=True)
    accent_color = serializers.CharField(allow_blank=True)
    response_status = serializers.CharField()
    already_responded = serializers.BooleanField()
    # False once the event is cancelled or completed.
    responses_open = serializers.BooleanField()
    is_cancelled = serializers.BooleanField()
    calendar_url = serializers.CharField()
    google_calendar_url = serializers.CharField()


class SubmitResponseSerializer(serializers.Serializer):
    """Serializer for validating a guest's Accept/Reject/Maybe submission."""

    response = serializers.ChoiceField(
        choices=["ACCEPTED", "REJECTED", "MAYBE"],
        required=True,
    )