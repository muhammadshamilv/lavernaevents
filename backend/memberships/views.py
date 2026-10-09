# backend/memberships/views.py
from rest_framework import status
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import MembershipPlan
from .serializers import (
    ChangePlanSerializer,
    MembershipPlanSerializer,
    MyUsageSerializer,
    SubscribeSerializer,
    SubscriptionSerializer,
    TopupPackSerializer,
)
from .services import (
    SubscriptionError,
    change_user_plan,
    get_active_subscription,
    get_organizer_template_count,
    subscribe_user_to_plan,
)
from .topup_models import TopupPack
from .utils import get_effective_plan

ERROR_STATUS_MAP = {
    "plan_not_found": status.HTTP_404_NOT_FOUND,
    "already_subscribed": status.HTTP_409_CONFLICT,
    "no_active_subscription": status.HTTP_409_CONFLICT,
    "same_plan": status.HTTP_409_CONFLICT,
    "payment_required": status.HTTP_402_PAYMENT_REQUIRED,
    "organizer_only": status.HTTP_403_FORBIDDEN,
    "mobile_not_verified": status.HTTP_403_FORBIDDEN,
}


def _subscription_error_response(error: SubscriptionError) -> Response:
    return Response(
        {
            "success": False,
            "message": error.message,
            "errors": {"plan_slug": [error.message]},
        },
        status=ERROR_STATUS_MAP.get(error.code, status.HTTP_400_BAD_REQUEST),
    )


class MembershipPlanListView(ListAPIView):
    """List all active membership plans, ordered for the public pricing page."""

    serializer_class = MembershipPlanSerializer
    permission_classes = [AllowAny]
    pagination_class = None

    def get_queryset(self):
        return MembershipPlan.objects.filter(is_active=True).order_by("display_order", "price")

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)

        return Response(
            {
                "success": True,
                "message": "Membership plans retrieved successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class MembershipPlanDetailView(APIView):
    """Retrieve a single active membership plan by its slug."""

    permission_classes = [AllowAny]

    def get(self, request, slug):
        plan = MembershipPlan.objects.filter(slug=slug, is_active=True).first()

        if plan is None:
            return Response(
                {
                    "success": False,
                    "message": "Membership plan not found.",
                    "errors": {"plan": ["No active plan found with this slug."]},
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            {
                "success": True,
                "message": "Membership plan retrieved successfully.",
                "data": MembershipPlanSerializer(plan).data,
            },
            status=status.HTTP_200_OK,
        )


class MySubscriptionView(APIView):
    """Retrieve the authenticated user's current active subscription."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        subscription = get_active_subscription(request.user)

        if subscription is None:
            return Response(
                {"success": True, "message": "No active subscription found.", "data": None},
                status=status.HTTP_200_OK,
            )

        return Response(
            {
                "success": True,
                "message": "Active subscription retrieved successfully.",
                "data": SubscriptionSerializer(subscription).data,
            },
            status=status.HTTP_200_OK,
        )


class SubscribeView(APIView):
    """Start a FREE membership plan (paid plans use payments checkout)."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = SubscribeSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(
                {"success": False, "message": "Invalid request.", "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            subscription = subscribe_user_to_plan(
                user=request.user,
                plan_slug=serializer.validated_data["plan_slug"],
            )
        except SubscriptionError as error:
            return _subscription_error_response(error)

        return Response(
            {
                "success": True,
                "message": "Subscribed successfully.",
                "data": SubscriptionSerializer(subscription).data,
            },
            status=status.HTTP_201_CREATED,
        )


class ChangePlanView(APIView):
    """Switch the active subscription to a FREE plan."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePlanSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(
                {"success": False, "message": "Invalid request.", "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            new_subscription, change_type = change_user_plan(
                user=request.user,
                new_plan_slug=serializer.validated_data["plan_slug"],
            )
        except SubscriptionError as error:
            return _subscription_error_response(error)

        return Response(
            {
                "success": True,
                "message": "Your plan has been changed.",
                "data": {
                    "change_type": change_type,
                    "subscription": SubscriptionSerializer(new_subscription).data,
                },
            },
            status=status.HTTP_200_OK,
        )


class MyUsageView(APIView):
    """The authenticated user's plan limits, usage and feature access."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        plan = get_effective_plan(request.user)

        if plan is None:
            data = {
                "plan_name": "No active plan",
                "has_active_plan": False,
                "guest_limit": None,
                "event_limit": None,
                "template_limit": None,
                "template_count": None,
                "template_remaining": None,
                "storage_limit_mb": None,
                "total_invitations": None,
                "invitations_used": None,
                "invitations_topup": None,
                "invitations_remaining": None,
                "voice_call_limit": None,
                "voice_calls_used": None,
                "voice_calls_topup": None,
                "voice_calls_remaining": None,
                "gallery_enabled": False,
                "qr_code_enabled": False,
                "photographer_access_enabled": False,
            }
        else:
            subscription = get_active_subscription(request.user)
            template_count = get_organizer_template_count(request.user)

            template_remaining = (
                None
                if plan.template_limit is None
                else max(plan.template_limit - template_count, 0)
            )

            data = {
                "plan_name": plan.name,
                "has_active_plan": True,
                "guest_limit": plan.guest_limit,
                "event_limit": plan.event_limit,
                "template_limit": plan.template_limit,
                "template_count": template_count,
                "template_remaining": template_remaining,
                "storage_limit_mb": plan.storage_limit_mb,
                "total_invitations": plan.total_invitations,
                "invitations_used": subscription.invitations_used if subscription else 0,
                "invitations_topup": subscription.invitations_topup if subscription else 0,
                "invitations_remaining": (
                    subscription.invitations_remaining() if subscription else plan.total_invitations
                ),
                "voice_call_limit": plan.voice_call_limit,
                "voice_calls_used": subscription.voice_calls_used if subscription else 0,
                "voice_calls_topup": subscription.voice_calls_topup if subscription else 0,
                "voice_calls_remaining": (
                    subscription.voice_calls_remaining() if subscription else plan.voice_call_limit
                ),
                "gallery_enabled": plan.gallery_enabled,
                "qr_code_enabled": plan.qr_code_enabled,
                "photographer_access_enabled": plan.photographer_access_enabled,
            }

        return Response(
            {
                "success": True,
                "message": "Usage summary retrieved successfully.",
                "data": MyUsageSerializer(data).data,
            },
            status=status.HTTP_200_OK,
        )


class PortalAccessView(APIView):
    """Can this user enter the organizer portal, and if not, what is the next step?

    Organizer: needs a verified mobile number AND an active plan.
    Admin: always allowed (admins do not buy plans).
    Anyone else (photographer ...): the organizer portal is not theirs.
    """

    permission_classes = [IsAuthenticated]

    @staticmethod
    def _reply(message, can_access, next_step):
        return Response(
            {
                "success": True,
                "message": message,
                "data": {"can_access_portal": can_access, "next_step": next_step},
            },
            status=status.HTTP_200_OK,
        )

    def get(self, request):
        user = request.user

        if user.role == "ADMIN":
            return self._reply("Portal access granted.", True, None)

        if user.role != "ORGANIZER":
            return self._reply("This account does not use the organizer portal.", False, None)

        if not user.is_verified:
            return self._reply("Mobile verification required.", False, "verify_mobile")

        if get_active_subscription(user) is None:
            return self._reply("An active membership plan is required.", False, "select_plan")

        return self._reply("Portal access granted.", True, None)


class TopupPackListView(ListAPIView):
    """List all active topup packs available for organizers to buy."""

    serializer_class = TopupPackSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return TopupPack.objects.filter(is_active=True).order_by("display_order", "price")

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)

        return Response(
            {
                "success": True,
                "message": "Topup packs retrieved successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )
