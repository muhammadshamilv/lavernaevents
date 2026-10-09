from rest_framework import serializers

from .models import Payment
from memberships.topup_models import TopupPurchase


class CreateCheckoutSessionSerializer(serializers.Serializer):
    """Serializer for validating a checkout session creation request."""

    plan_slug = serializers.SlugField(required=True)


class PaymentSerializer(serializers.ModelSerializer):
    """Serializer for reading payment record details."""

    plan_name = serializers.CharField(
        source="plan.name",
        read_only=True,
    )

    class Meta:
        model = Payment
        fields = (
            "id",
            "plan_name",
            "stripe_checkout_session_id",
            "amount",
            "currency",
            "status",
            "created_at",
        )
        read_only_fields = fields


# ---------------------------------------------------------------------
# Phase 26: organizer topup pack purchases
# ---------------------------------------------------------------------

class CreateTopupCheckoutSessionSerializer(serializers.Serializer):
    """Serializer for validating a topup checkout session creation request."""

    pack_id = serializers.IntegerField(required=True)


class TopupPurchaseSerializer(serializers.ModelSerializer):
    """Serializer for reading topup purchase record details."""

    pack_name = serializers.CharField(
        source="pack.name",
        read_only=True,
    )

    pack_kind = serializers.CharField(
        source="pack.kind",
        read_only=True,
    )

    pack_quantity = serializers.IntegerField(
        source="pack.quantity",
        read_only=True,
    )

    class Meta:
        model = TopupPurchase
        fields = (
            "id",
            "pack_name",
            "pack_kind",
            "pack_quantity",
            "stripe_checkout_session_id",
            "amount",
            "status",
            "created_at",
        )
        read_only_fields = fields


# ---------------------------------------------------------------------
# Billing history (plan payments + topup purchases in one list)
# ---------------------------------------------------------------------

class PaymentHistoryItemSerializer(serializers.Serializer):
    """One row of the organizer's billing history."""

    id = serializers.CharField()
    kind = serializers.ChoiceField(choices=["PLAN", "TOPUP"])
    description = serializers.CharField()
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    currency = serializers.CharField()
    status = serializers.CharField()
    created_at = serializers.DateTimeField()
