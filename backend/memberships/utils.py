from .models import MembershipPlan, OrganizerTemplateLibrary
from .topup_models import PlatformChannelPool


class LimitExceededError(Exception):
    """Raised when a plan limit would be exceeded by the requested action."""

    def __init__(self, message: str, code: str = "limit_exceeded"):
        self.message = message
        self.code = code
        super().__init__(message)


def get_active_subscription(user):
    """Return the user's currently active subscription, if any.

    Deferred import to avoid a circular import between memberships.utils
    and memberships.services (services imports models directly; utils
    is the one place both views and other apps' services reach into).
    """

    from .services import get_active_subscription as _get_active_subscription

    return _get_active_subscription(user)


def get_effective_plan(user) -> MembershipPlan | None:
    """Return the user's currently active plan, or None if they have none."""

    subscription = get_active_subscription(user)

    if subscription is None:
        return None

    return subscription.plan


def check_guest_limit(user, current_guest_count: int) -> None:
    """Raise LimitExceededError if adding another guest would exceed the plan's guest_limit."""

    plan = get_effective_plan(user)

    if plan is None:
        raise LimitExceededError(
            "An active membership plan is required to add guests.",
            code="no_active_plan",
        )

    if current_guest_count >= plan.guest_limit:
        raise LimitExceededError(
            f"Guest limit reached. Your {plan.name} plan allows up to {plan.guest_limit} guests.",
            code="guest_limit_exceeded",
        )


def check_event_limit(user, current_event_count: int) -> None:
    """Raise LimitExceededError if creating another event would exceed the plan's event_limit."""

    plan = get_effective_plan(user)

    if plan is None:
        raise LimitExceededError(
            "An active membership plan is required to create an event.",
            code="no_active_plan",
        )

    if current_event_count >= plan.event_limit:
        raise LimitExceededError(
            f"Event limit reached. Your {plan.name} plan allows up to {plan.event_limit} active events.",
            code="event_limit_exceeded",
        )


def check_template_limit(user, template) -> None:
    """Raise LimitExceededError only if this is a NEW template for the organizer
    and adding it would exceed the plan's template_limit (a total COUNT,
    not a specific-template list).

    Phase 17: replaces the old M2M-based check_template_access(). An
    already-added template (one with an existing OrganizerTemplateLibrary
    row) always passes - reuse is unlimited. Only adding a never-before-
    used template is checked against the remaining count. Does NOT create
    the library row itself - callers add it only after this check passes
    and the action (invitation generation / template upload) actually
    succeeds, so a failed render doesn't consume a slot. See
    memberships.services.add_template_to_library.
    """

    plan = get_effective_plan(user)

    if plan is None:
        raise LimitExceededError(
            "An active membership plan is required to use templates.",
            code="no_active_plan",
        )

    # A template that is not saved yet (a custom upload being checked before
    # it is created) cannot be in anyone's library - and filtering on an
    # unsaved instance raises ValueError.
    already_in_library = template.pk is not None and OrganizerTemplateLibrary.objects.filter(
        organizer=user,
        template=template,
    ).exists()

    if already_in_library:
        return

    if plan.template_limit is None:
        return

    current_count = OrganizerTemplateLibrary.objects.filter(organizer=user).count()

    if current_count >= plan.template_limit:
        raise LimitExceededError(
            f"Template library limit reached. Your {plan.name} plan allows up to "
            f"{plan.template_limit} templates. Remove one or upgrade your plan to add more.",
            code="template_limit_exceeded",
        )


def invitation_quota_error(subscription, count_needed: int = 1) -> LimitExceededError | None:
    """The error for sending `count_needed` invitations on this subscription,
    or None if its shared WhatsApp/Email/SMS pool (plan + topups) allows it.

    Shared by the read-only check below and by
    memberships.services.reserve_send_quota, so both always agree.
    """

    if subscription.plan.total_invitations is None:
        return None

    remaining = subscription.invitations_remaining()

    if remaining is not None and remaining < count_needed:
        return LimitExceededError(
            f"Invitation limit reached. Your {subscription.plan.name} plan allows "
            f"{subscription.plan.total_invitations} invitations total, and you have "
            f"{remaining} remaining.",
            code="invitation_limit_exceeded",
        )

    return None


def voice_quota_error(subscription, count_needed: int = 1) -> LimitExceededError | None:
    """The error for placing `count_needed` voice calls on this subscription,
    or None if its voice pool (plan + topups) allows it."""

    if subscription.plan.voice_call_limit is None:
        return None

    if subscription.plan.voice_call_limit == 0:
        return LimitExceededError(
            f"Voice call invitations are not available on your {subscription.plan.name} plan.",
            code="voice_call_not_available",
        )

    remaining = subscription.voice_calls_remaining()

    if remaining is not None and remaining < count_needed:
        return LimitExceededError(
            f"Voice call limit reached. Your {subscription.plan.name} plan allows "
            f"{subscription.plan.voice_call_limit} voice calls total, and you have "
            f"{remaining} remaining.",
            code="voice_call_limit_exceeded",
        )

    return None


def no_active_plan_error(voice: bool) -> LimitExceededError:
    return LimitExceededError(
        "An active membership plan is required to place voice calls."
        if voice
        else "An active membership plan is required to send invitations.",
        code="no_active_plan",
    )


def check_invitation_limit(user, count_needed: int = 1) -> None:
    """Raise LimitExceededError if sending `count_needed` more invitations
    would exceed the subscription's shared total_invitations pool.

    Read-only pre-check. The actual send path RESERVES quota atomically with
    memberships.services.reserve_send_quota instead.
    """

    subscription = get_active_subscription(user)

    if subscription is None:
        raise no_active_plan_error(voice=False)

    error = invitation_quota_error(subscription, count_needed)

    if error is not None:
        raise error


def check_voice_call_limit(user, count_needed: int = 1) -> None:
    """Raise LimitExceededError if placing `count_needed` more voice calls
    would exceed the subscription's voice_call_limit pool (read-only
    pre-check; see check_invitation_limit)."""

    subscription = get_active_subscription(user)

    if subscription is None:
        raise no_active_plan_error(voice=True)

    error = voice_quota_error(subscription, count_needed)

    if error is not None:
        raise error


def check_storage_limit(user, current_usage_mb: float, new_file_size_mb: float) -> None:
    """Raise LimitExceededError if uploading this file would exceed the plan's storage_limit_mb."""

    plan = get_effective_plan(user)

    if plan is None:
        raise LimitExceededError(
            "An active membership plan is required to upload media.",
            code="no_active_plan",
        )

    if current_usage_mb + new_file_size_mb > plan.storage_limit_mb:
        raise LimitExceededError(
            f"Storage limit reached. Your {plan.name} plan allows up to "
            f"{plan.storage_limit_mb} MB of storage.",
            code="storage_limit_exceeded",
        )


def check_gallery_access(user) -> None:
    """Raise LimitExceededError if the user's plan does not include gallery access."""

    plan = get_effective_plan(user)

    if plan is None:
        raise LimitExceededError(
            "An active membership plan is required to access the gallery.",
            code="no_active_plan",
        )

    if not plan.gallery_enabled:
        raise LimitExceededError(
            f"The gallery feature is not available on your {plan.name} plan.",
            code="gallery_not_available",
        )


def check_qr_code_access(user) -> None:
    """Raise LimitExceededError if the user's plan does not include QR code access."""

    plan = get_effective_plan(user)

    if plan is None:
        raise LimitExceededError(
            "An active membership plan is required to use QR codes.",
            code="no_active_plan",
        )

    if not plan.qr_code_enabled:
        raise LimitExceededError(
            f"QR codes are not available on your {plan.name} plan.",
            code="qr_code_not_available",
        )


def check_photographer_access(user) -> None:
    """Raise LimitExceededError if the user's plan does not include photographer access."""

    plan = get_effective_plan(user)

    if plan is None:
        raise LimitExceededError(
            "An active membership plan is required to add a photographer.",
            code="no_active_plan",
        )

    if not plan.photographer_access_enabled:
        raise LimitExceededError(
            f"Photographer access is not available on your {plan.name} plan.",
            code="photographer_not_available",
        )
    

# --------------------------------------------------
# Phase 26: platform-wide channel pools
# --------------------------------------------------

def platform_pool_error(pool, count_needed: int = 1) -> LimitExceededError | None:
    """The error when the admin's platform-wide pool for a channel can't
    cover `count_needed` more sends, else None. A channel with no pool row
    is unlimited (callers pass pool=None)."""

    if pool is None or pool.remaining() >= count_needed:
        return None

    return LimitExceededError(
        f"{pool.get_channel_display()} is temporarily unavailable platform-wide "
        "due to capacity limits. Please try a different channel, or contact "
        "support.",
        code="platform_pool_exhausted",
    )


def check_platform_pool(channel: str, count_needed: int = 1) -> None:
    """Raise LimitExceededError if the admin's platform-wide pool for this
    channel doesn't have `count_needed` units left.

    Channel-agnostic and organizer-agnostic by design: this is the ONE
    supply-side constraint that applies to every send on this channel. A
    pool that was never topped up by the admin (no PlatformChannelPool row
    for this channel) is treated as unlimited, so a fresh deployment never
    silently blocks sends before the admin has set anything up.

    Read-only pre-check; the send path reserves pool capacity atomically
    with memberships.services.reserve_send_quota. Organizer quota is
    checked first, then this, so support can tell which one ran out.
    """

    error = platform_pool_error(PlatformChannelPool.objects.filter(channel=channel).first(), count_needed)

    if error is not None:
        raise error
