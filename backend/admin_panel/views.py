from common.permissions import IsAdminRole
from django.db.models import Q
from django.shortcuts import get_object_or_404
from gallery.models import GalleryMedia
from gallery.services import delete_media
from invitations.models import InvitationTemplate
from memberships.models import MembershipPlan
from memberships.topup_models import TopupPack
from rest_framework import status
from rest_framework.generics import ListAPIView
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from users.models import User

from .serializers import (
    AdminDashboardStatsSerializer,
    AdminGalleryMediaSerializer,
    AdminInvitationTemplateSerializer,
    AdminMembershipPlanSerializer,
    AdminReportsSerializer,
    AdminTopupPackSerializer,
    AdminUserListSerializer,
    AdminUserUpdateSerializer,
    PlatformChannelPoolSerializer,
    PlatformPoolTopupCreateSerializer,
    PlatformPoolTopupSerializer,
)
from .services import (
    AdminError,
    check_user_update,
    delete_plan,
    delete_template,
    delete_user,
    get_dashboard_stats,
    get_pool_topup_history,
    get_reports,
    list_channel_pools,
    suspend_user,
    topup_channel_pool,
    unsuspend_user,
)

ADMIN_ERROR_STATUS_MAP = {
    "cannot_modify_self": status.HTTP_400_BAD_REQUEST,
    "last_admin": status.HTTP_409_CONFLICT,
    "in_use": status.HTTP_409_CONFLICT,
}


def _ok(message: str, data=None, code=status.HTTP_200_OK) -> Response:
    return Response({"success": True, "message": message, "data": {} if data is None else data}, status=code)


def _invalid(message: str, errors) -> Response:
    return Response(
        {"success": False, "message": message, "errors": errors},
        status=status.HTTP_400_BAD_REQUEST,
    )


def _admin_error(error: AdminError) -> Response:
    return Response(
        {"success": False, "message": error.message, "errors": {"detail": [error.message]}},
        status=ADMIN_ERROR_STATUS_MAP.get(error.code, status.HTTP_400_BAD_REQUEST),
    )


class AdminAPIView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]


# --------------------------------------------------
# Dashboard
# --------------------------------------------------

class AdminDashboardStatsView(AdminAPIView):
    """Total Users, Active Events, Membership Sales, Revenue, Storage Usage
    and platform channel capacity."""

    def get(self, request):
        return _ok(
            "Dashboard stats retrieved successfully.",
            AdminDashboardStatsSerializer(get_dashboard_stats()).data,
        )


# --------------------------------------------------
# User Management
# --------------------------------------------------

class AdminUserListView(ListAPIView):
    """List every user, with search and role/status filters (paged)."""

    serializer_class = AdminUserListSerializer
    permission_classes = [IsAuthenticated, IsAdminRole]
    filterset_fields = ["role", "is_active", "is_suspended", "is_verified"]

    def get_queryset(self):
        queryset = User.objects.all().order_by("-created_at", "-id")
        search = (self.request.query_params.get("search") or "").strip()

        if search:
            condition = (
                Q(full_name__icontains=search)
                | Q(email__icontains=search)
                | Q(mobile_number__icontains=search)
            )
            # "+91 98765 43210" is stored as its last 10 digits.
            digits = "".join(ch for ch in search if ch.isdigit())
            if len(digits) >= 10:
                condition |= Q(mobile_number__icontains=digits[-10:])
            queryset = queryset.filter(condition)

        return queryset

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)

        if page is not None:
            return self.get_paginated_response(self.get_serializer(page, many=True).data)

        return _ok("Users retrieved successfully.", self.get_serializer(queryset, many=True).data)


class AdminUserDetailView(AdminAPIView):
    """View / edit / delete a single user."""

    def get(self, request, user_pk):
        user = get_object_or_404(User, pk=user_pk)

        return _ok("User retrieved successfully.", AdminUserListSerializer(user).data)

    def patch(self, request, user_pk):
        user = get_object_or_404(User, pk=user_pk)
        serializer = AdminUserUpdateSerializer(user, data=request.data, partial=True)

        if not serializer.is_valid():
            return _invalid("User update failed.", serializer.errors)

        try:
            check_user_update(request.user, user, serializer.validated_data)
        except AdminError as error:
            return _admin_error(error)

        serializer.save()

        return _ok("User updated successfully.", AdminUserListSerializer(user).data)

    def delete(self, request, user_pk):
        user = get_object_or_404(User, pk=user_pk)

        try:
            delete_user(request.user, user)
        except AdminError as error:
            return _admin_error(error)

        return _ok("User deleted successfully.")


class AdminUserSuspendView(AdminAPIView):
    """Block login without deleting the account."""

    def post(self, request, user_pk):
        user = get_object_or_404(User, pk=user_pk)

        try:
            user = suspend_user(request.user, user)
        except AdminError as error:
            return _admin_error(error)

        return _ok("User suspended successfully.", AdminUserListSerializer(user).data)


class AdminUserUnsuspendView(AdminAPIView):
    """Reverse a suspension."""

    def post(self, request, user_pk):
        user = get_object_or_404(User, pk=user_pk)
        user = unsuspend_user(request.user, user)

        return _ok("User unsuspended successfully.", AdminUserListSerializer(user).data)


# --------------------------------------------------
# Membership Management
# --------------------------------------------------

class AdminMembershipPlanListCreateView(AdminAPIView):
    """List all plans (including inactive) or create one."""

    def get(self, request):
        plans = MembershipPlan.objects.all().order_by("display_order", "price")

        return _ok("Membership plans retrieved successfully.", AdminMembershipPlanSerializer(plans, many=True).data)

    def post(self, request):
        serializer = AdminMembershipPlanSerializer(data=request.data)

        if not serializer.is_valid():
            return _invalid("Plan creation failed.", serializer.errors)

        plan = serializer.save()

        return _ok("Plan created successfully.", AdminMembershipPlanSerializer(plan).data, status.HTTP_201_CREATED)


class AdminMembershipPlanDetailView(AdminAPIView):
    """Edit or delete a plan."""

    def patch(self, request, plan_pk):
        plan = get_object_or_404(MembershipPlan, pk=plan_pk)
        serializer = AdminMembershipPlanSerializer(plan, data=request.data, partial=True)

        if not serializer.is_valid():
            return _invalid("Plan update failed.", serializer.errors)

        serializer.save()

        return _ok("Plan updated successfully.", AdminMembershipPlanSerializer(plan).data)

    def delete(self, request, plan_pk):
        plan = get_object_or_404(MembershipPlan, pk=plan_pk)

        try:
            delete_plan(request.user, plan)
        except AdminError as error:
            return _admin_error(error)

        return _ok("Plan deleted successfully.")


# --------------------------------------------------
# Invitation Templates (platform templates only)
# --------------------------------------------------

def _platform_templates():
    """Templates the platform provides. Organizers' own uploads are theirs
    and are not managed here."""

    return InvitationTemplate.objects.filter(is_custom=False)


class AdminInvitationTemplateListCreateView(AdminAPIView):
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        templates = _platform_templates().order_by("display_order", "name")

        return _ok(
            "Invitation templates retrieved successfully.",
            AdminInvitationTemplateSerializer(templates, many=True, context={"request": request}).data,
        )

    def post(self, request):
        serializer = AdminInvitationTemplateSerializer(data=request.data, context={"request": request})

        if not serializer.is_valid():
            return _invalid("Template creation failed.", serializer.errors)

        template = serializer.save()

        return _ok(
            "Template created successfully.",
            AdminInvitationTemplateSerializer(template, context={"request": request}).data,
            status.HTTP_201_CREATED,
        )


class AdminInvitationTemplateDetailView(AdminAPIView):
    parser_classes = [MultiPartParser, FormParser]

    def patch(self, request, template_pk):
        template = get_object_or_404(_platform_templates(), pk=template_pk)
        serializer = AdminInvitationTemplateSerializer(
            template, data=request.data, partial=True, context={"request": request}
        )

        if not serializer.is_valid():
            return _invalid("Template update failed.", serializer.errors)

        serializer.save()

        return _ok(
            "Template updated successfully.",
            AdminInvitationTemplateSerializer(template, context={"request": request}).data,
        )

    def delete(self, request, template_pk):
        template = get_object_or_404(_platform_templates(), pk=template_pk)

        try:
            delete_template(request.user, template)
        except AdminError as error:
            return _admin_error(error)

        return _ok("Template deleted successfully.")


# --------------------------------------------------
# Media Management
# --------------------------------------------------

class AdminGalleryMediaListView(ListAPIView):
    """Browse gallery media platform-wide (paged)."""

    serializer_class = AdminGalleryMediaSerializer
    permission_classes = [IsAuthenticated, IsAdminRole]
    filterset_fields = ["media_type", "event"]

    def get_queryset(self):
        return GalleryMedia.objects.select_related("event", "uploaded_by").order_by("-created_at", "-id")

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)

        if page is not None:
            return self.get_paginated_response(self.get_serializer(page, many=True).data)

        return _ok("Gallery media retrieved successfully.", self.get_serializer(queryset, many=True).data)


class AdminGalleryMediaDeleteView(AdminAPIView):
    """Remove any media platform-wide."""

    def delete(self, request, media_pk):
        delete_media(get_object_or_404(GalleryMedia, pk=media_pk))

        return _ok("Media deleted successfully.")


# --------------------------------------------------
# Reports
# --------------------------------------------------

class AdminReportsView(AdminAPIView):
    def get(self, request):
        return _ok("Reports retrieved successfully.", AdminReportsSerializer(get_reports()).data)


# --------------------------------------------------
# Platform channel pools
# --------------------------------------------------

class AdminChannelPoolListView(AdminAPIView):
    def get(self, request):
        return _ok(
            "Channel pools retrieved successfully.",
            PlatformChannelPoolSerializer(list_channel_pools(), many=True).data,
        )


class AdminChannelPoolTopupView(AdminAPIView):
    def post(self, request):
        serializer = PlatformPoolTopupCreateSerializer(data=request.data)

        if not serializer.is_valid():
            return _invalid("Invalid topup request.", serializer.errors)

        data = serializer.validated_data
        pool = topup_channel_pool(
            channel=data["channel"],
            amount=data["amount"],
            note=data.get("note", ""),
            admin_user=request.user,
            low_balance_threshold=data.get("low_balance_threshold"),
        )

        return _ok("Pool topped up successfully.", PlatformChannelPoolSerializer(pool).data)


class AdminChannelPoolTopupHistoryView(AdminAPIView):
    def get(self, request):
        history = get_pool_topup_history(channel=request.query_params.get("channel"))

        return _ok("Topup history retrieved successfully.", PlatformPoolTopupSerializer(history, many=True).data)


# --------------------------------------------------
# Topup pack administration
# --------------------------------------------------

class AdminTopupPackListCreateView(AdminAPIView):
    def get(self, request):
        packs = TopupPack.objects.all().order_by("display_order", "price")

        return _ok("Topup packs retrieved successfully.", AdminTopupPackSerializer(packs, many=True).data)

    def post(self, request):
        serializer = AdminTopupPackSerializer(data=request.data)

        if not serializer.is_valid():
            return _invalid("Topup pack creation failed.", serializer.errors)

        pack = serializer.save()

        return _ok("Topup pack created successfully.", AdminTopupPackSerializer(pack).data, status.HTTP_201_CREATED)


class AdminTopupPackDetailView(AdminAPIView):
    """Edit a pack, or deactivate it (DELETE keeps the row so existing
    purchases still point at a real pack)."""

    def patch(self, request, pack_pk):
        pack = get_object_or_404(TopupPack, pk=pack_pk)
        serializer = AdminTopupPackSerializer(pack, data=request.data, partial=True)

        if not serializer.is_valid():
            return _invalid("Topup pack update failed.", serializer.errors)

        pack = serializer.save()

        return _ok("Topup pack updated successfully.", AdminTopupPackSerializer(pack).data)

    def delete(self, request, pack_pk):
        pack = get_object_or_404(TopupPack, pk=pack_pk)
        pack.is_active = False
        pack.save(update_fields=["is_active", "updated_at"])

        return _ok("Topup pack deactivated successfully.", AdminTopupPackSerializer(pack).data)
