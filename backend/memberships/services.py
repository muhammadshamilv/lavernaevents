# backend/memberships/services.py
from datetime import timedelta

from django.db import models, transaction
from django.db.models import Count
from django.utils import timezone

from .models import MembershipPlan, OrganizerTemplateLibrary, Subscription


class SubscriptionError(Exception):
    """Raised when a subscription action cannot be completed."""

    def __init__(self, message: str, code: str = "subscription_error"):
        self.message = message
        self.code = code
        super().__init__(message)


# --------------------------------------------------
# Reading / expiring subscriptions
# --------------------------------------------------

def expire_overdue_subscriptions(user=None) -> int:
    """Mark every ACTIVE subscription whose time is up as EXPIRED.

    Returns how many rows changed. Pass a user to limit it to that user.
    Also run for everyone by `manage.py expire_subscriptions` so the
    stored status stays tidy even for people who never log in again.
    """

    queryset = Subscription.objects.filter(
        status=Subscription.Status.ACTIVE,
        expires_at__lte=timezone.now(),
    )

    if user is not None:
        queryset = queryset.filter(user=user)

    return queryset.update(
        status=Subscription.Status.EXPIRED,
        updated_at=timezone.now(),
    )


def get_active_subscription(user) -> Subscription | None:
    """Return the user's current, NOT-yet-expired subscription, if any.

    Expiry is enforced here, at read time: a subscription whose
    `expires_at` has passed is never returned (and is tidied to EXPIRED),
    so every limit check in the project stops honouring it on the exact
    second it ends, with no background job required.
    """

    if user is None or not getattr(user, "pk", None):
        return None

    subscription = (
        Subscription.objects.select_related("plan")
        .filter(
            user=user,
            status=Subscription.Status.ACTIVE,
            expires_at__gt=timezone.now(),
        )
        .order_by("-created_at")
        .first()
    )

    if subscription is None:
        expire_overdue_subscriptions(user)

    return subscription


def lock_user(user):
    """Row-lock the user for the rest of the surrounding transaction.

    Serialises two simultaneous purchases / webhooks for the SAME user so
    they can never both create an active subscription. Must be called
    inside `transaction.atomic()`.
    """

    return type(user).objects.select_for_update().get(pk=user.pk)


def check_can_purchase(user) -> None:
    """Only a verified ORGANIZER may buy or switch plans and topups."""

    if getattr(user, "role", None) != "ORGANIZER":
        raise SubscriptionError(
            "Only organizer accounts can have a membership plan.",
            code="organizer_only",
        )

    if not user.is_verified:
        raise SubscriptionError(
            "Please verify your mobile number before choosing a plan.",
            code="mobile_not_verified",
        )


# --------------------------------------------------
# Creating subscriptions
# --------------------------------------------------

def _carry_over_topups(old: Subscription | None) -> dict:
    """The UNUSED part of purchased topups moves to the next subscription.

    Plan allowance is spent before topup allowance, so what is left of the
    topup is min(topup bought, total remaining). An unlimited plan has no
    topup to carry.
    """

    if old is None:
        return {}

    invitations_left = old.invitations_remaining()
    voice_left = old.voice_calls_remaining()

    return {
        "invitations_topup": (
            0 if invitations_left is None else min(old.invitations_topup, invitations_left)
        ),
        "voice_calls_topup": (
            0 if voice_left is None else min(old.voice_calls_topup, voice_left)
        ),
    }


def create_active_subscription(
    user,
    plan: MembershipPlan,
    carry_over_from: Subscription | None = None,
) -> Subscription:
    """Create and return a new active subscription for the given plan.

    Callers must make sure the user has no other active subscription (use
    `activate_plan_for_user` for the full, safe sequence).
    """

    return Subscription.objects.create(
        user=user,
        plan=plan,
        status=Subscription.Status.ACTIVE,
        expires_at=timezone.now() + timedelta(days=plan.duration_days),
        **_carry_over_topups(carry_over_from),
    )


def activate_plan_for_user(user, plan: MembershipPlan) -> Subscription:
    """Put the user on `plan`: cancel any current plan, start the new one.

    The ONE path used by upgrades (after Stripe payment), free-plan
    switches and renewals. Atomic and user-locked, so a double webhook or a
    double click can never produce two active subscriptions.
    """

    with transaction.atomic():
        lock_user(user)

        current = get_active_subscription(user)

        if current is not None:
            now = timezone.now()

            Subscription.objects.filter(pk=current.pk).update(
                status=Subscription.Status.CANCELLED,
                cancelled_at=now,
                updated_at=now,
            )

        return create_active_subscription(user, plan, carry_over_from=current)


def subscribe_user_to_plan(user, plan_slug: str) -> Subscription:
    """Start a FREE plan (price = 0) for a user with no active plan.

    Paid plans must go through the payments app's checkout flow instead.
    """

    check_can_purchase(user)

    plan = MembershipPlan.objects.filter(
        slug=plan_slug,
        is_active=True,
    ).first()

    if plan is None:
        raise SubscriptionError(
            "No active membership plan found with this slug.",
            code="plan_not_found",
        )

    if plan.price > 0:
        raise SubscriptionError(
            "This plan requires payment. Please use the checkout flow.",
            code="payment_required",
        )

    with transaction.atomic():
        lock_user(user)

        if get_active_subscription(user) is not None:
            raise SubscriptionError(
                "You already have an active subscription. "
                "Use the upgrade or downgrade option instead.",
                code="already_subscribed",
            )

        return create_active_subscription(user, plan)


def change_user_plan(user, new_plan_slug: str) -> tuple[Subscription, str]:
    """Switch the user's active plan to a FREE plan.

    Switching to a paid plan goes through payments checkout instead.
    Returns (new_subscription, change_type) where change_type is
    "downgrade" when the new plan is cheaper, otherwise "same".
    """

    check_can_purchase(user)

    current_subscription = get_active_subscription(user)

    if current_subscription is None:
        raise SubscriptionError(
            "You do not have an active subscription to change. "
            "Use the subscribe endpoint instead.",
            code="no_active_subscription",
        )

    new_plan = MembershipPlan.objects.filter(
        slug=new_plan_slug,
        is_active=True,
    ).first()

    if new_plan is None:
        raise SubscriptionError(
            "No active membership plan found with this slug.",
            code="plan_not_found",
        )

    if new_plan.pk == current_subscription.plan_id:
        raise SubscriptionError(
            "You are already subscribed to this plan.",
            code="same_plan",
        )

    if new_plan.price > 0:
        raise SubscriptionError(
            "This plan requires payment. Please use the checkout flow.",
            code="payment_required",
        )

    change_type = (
        "downgrade"
        if new_plan.price < current_subscription.plan.price
        else "same"
    )

    return activate_plan_for_user(user, new_plan), change_type


def dedupe_active_subscriptions() -> int:
    """Keep only the newest ACTIVE subscription of every user (clean-up for
    data created before the one-active-per-user rule existed)."""

    duplicate_users = (
        Subscription.objects.filter(status=Subscription.Status.ACTIVE)
        .values("user")
        .annotate(total=Count("id"))
        .filter(total__gt=1)
        .values_list("user", flat=True)
    )

    cancelled = 0
    now = timezone.now()

    for user_id in list(duplicate_users):
        subscriptions = list(
            Subscription.objects.filter(
                user_id=user_id,
                status=Subscription.Status.ACTIVE,
            ).order_by("-created_at")
        )

        for old in subscriptions[1:]:
            old.status = Subscription.Status.CANCELLED
            old.cancelled_at = now
            old.save(update_fields=["status", "cancelled_at", "updated_at"])
            cancelled += 1

    return cancelled


# --------------------------------------------------
# Template library (Phase 17)
# --------------------------------------------------

def add_template_to_library(organizer, template) -> OrganizerTemplateLibrary:
    """Record that an organizer has added/used a template, if not already recorded.

    Idempotent - safe to call every time a template is used.
    """

    entry, _ = OrganizerTemplateLibrary.objects.get_or_create(
        organizer=organizer,
        template=template,
    )

    return entry


def get_organizer_template_count(organizer) -> int:
    """How many distinct templates this organizer currently has in their library."""

    return OrganizerTemplateLibrary.objects.filter(organizer=organizer).count()


def remove_template_from_library(organizer, template) -> None:
    """Remove a template from the organizer's library, freeing a template_limit slot."""

    OrganizerTemplateLibrary.objects.filter(
        organizer=organizer,
        template=template,
    ).delete()


# --------------------------------------------------
# Invitation quota spending (Phase 17)
# --------------------------------------------------

def spend_invitation_quota(user, count: int = 1) -> None:
    """Increment the active subscription's invitations_used by `count`."""

    subscription = get_active_subscription(user)

    if subscription is None:
        return

    Subscription.objects.filter(pk=subscription.pk).update(
        invitations_used=models.F("invitations_used") + count,
        updated_at=timezone.now(),
    )


def spend_voice_call_quota(user, count: int = 1) -> None:
    """Increment the active subscription's voice_calls_used by `count`."""

    subscription = get_active_subscription(user)

    if subscription is None:
        return

    Subscription.objects.filter(pk=subscription.pk).update(
        voice_calls_used=models.F("voice_calls_used") + count,
        updated_at=timezone.now(),
    )
