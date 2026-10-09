import logging
from datetime import datetime, time, timedelta

from django.db import transaction
from django.db.models import Count, F, Q, Sum
from django.db.models.deletion import ProtectedError
from django.db.models.functions import TruncDate
from django.utils import timezone
from events.models import Event
from gallery.models import GalleryMedia
from memberships.models import MembershipPlan, Subscription
from memberships.topup_models import PlatformChannelPool, PlatformPoolTopup, TopupPurchase
from payments.models import Payment
from users.models import User

from .helpers import ZERO_MONEY, fill_daily_series

logger = logging.getLogger(__name__)

MB = 1024 * 1024
REPORT_DAYS = 30


class AdminError(Exception):
    """Raised when an admin action cannot be completed."""

    def __init__(self, message: str, code: str = "admin_error"):
        self.message = message
        self.code = code
        super().__init__(message)


# --------------------------------------------------
# Dashboard
# --------------------------------------------------

def get_storage_usage_mb() -> float:
    """Total size of all gallery media in MB. Rows without a recorded size
    (uploaded before sizes were saved) count as 0."""

    total_bytes = GalleryMedia.objects.aggregate(total=Sum("file_size"))["total"] or 0

    return round(total_bytes / MB, 2)


def get_channel_usage() -> list[dict]:
    """Usage of every CONFIGURED platform channel pool. A channel never
    topped up is unlimited, so there is nothing to monitor for it."""

    return [
        {
            "channel": pool.channel,
            "channel_display": pool.get_channel_display(),
            "total_capacity": pool.total_capacity,
            "used": pool.used,
            "remaining": pool.remaining(),
            "is_low": pool.is_low(),
            "is_exhausted": pool.is_exhausted(),
        }
        for pool in PlatformChannelPool.objects.all().order_by("channel")
    ]


def get_dashboard_stats() -> dict:
    """Top-line numbers. Revenue = paid plan payments + paid topup packs;
    membership_sales counts plan payments only."""

    paid_plans = Payment.objects.filter(status=Payment.Status.PAID)
    paid_topups = TopupPurchase.objects.filter(status=TopupPurchase.Status.PAID)

    plan_revenue = paid_plans.aggregate(total=Sum("amount"))["total"] or ZERO_MONEY
    topup_revenue = paid_topups.aggregate(total=Sum("amount"))["total"] or ZERO_MONEY

    return {
        "total_users": User.objects.count(),
        "active_events": Event.objects.filter(status=Event.Status.PUBLISHED).count(),
        "membership_sales": paid_plans.count(),
        "revenue": plan_revenue + topup_revenue,
        "storage_usage_mb": get_storage_usage_mb(),
        "channel_usage": get_channel_usage(),
    }


# --------------------------------------------------
# User Management
# --------------------------------------------------

def _other_active_admins_exist(excluding_pk: int) -> bool:
    return (
        User.objects.filter(role=User.Role.ADMIN, is_active=True, is_suspended=False)
        .exclude(pk=excluding_pk)
        .exists()
    )


def _is_active_admin(user) -> bool:
    return user.role == User.Role.ADMIN and user.is_active and not user.is_suspended


def check_user_update(actor, target, changes: dict) -> None:
    """Block edits that would lock the admins out of the platform: an admin
    cannot demote or deactivate themselves, and the last active admin can
    never be demoted or deactivated by anyone."""

    new_role = changes.get("role", target.role)
    new_active = changes.get("is_active", target.is_active)

    removes_admin = _is_active_admin(target) and (new_role != User.Role.ADMIN or not new_active)

    if not removes_admin:
        return

    if actor.pk == target.pk:
        raise AdminError(
            "You can't remove your own admin access. Ask another admin to do it.",
            code="cannot_modify_self",
        )

    if not _other_active_admins_exist(target.pk):
        raise AdminError("This is the last active admin, so it can't be changed.", code="last_admin")


def suspend_user(actor, user: User) -> User:
    """Block a user from logging in (enforced at login and on every request)."""

    if actor.pk == user.pk:
        raise AdminError("You can't suspend your own account.", code="cannot_modify_self")

    if _is_active_admin(user) and not _other_active_admins_exist(user.pk):
        raise AdminError("This is the last active admin, so it can't be suspended.", code="last_admin")

    user.is_suspended = True
    user.save(update_fields=["is_suspended", "updated_at"])
    logger.info("Admin %s suspended user %s.", actor.pk, user.pk)

    return user


def unsuspend_user(actor, user: User) -> User:
    user.is_suspended = False
    user.save(update_fields=["is_suspended", "updated_at"])
    logger.info("Admin %s unsuspended user %s.", actor.pk, user.pk)

    return user


def delete_user(actor, user: User) -> None:
    """Permanently delete an account and everything that belongs to it
    (events, guests, gallery rows ...). The uploaded gallery files are
    removed from storage afterwards so they don't linger and cost money."""

    if actor.pk == user.pk:
        raise AdminError("You can't delete your own account.", code="cannot_modify_self")

    if _is_active_admin(user) and not _other_active_admins_exist(user.pk):
        raise AdminError("This is the last active admin, so it can't be deleted.", code="last_admin")

    stored = [
        (field.storage, field.name)
        for media in GalleryMedia.objects.filter(event__organizer=user)
        for field in (media.file, media.thumbnail)
        if field and field.name
    ]

    try:
        with transaction.atomic():
            user.delete()
    except ProtectedError:
        raise AdminError(
            "This user has records that must be kept (for example payments). Suspend the account instead.",
            code="in_use",
        )

    logger.info("Admin %s deleted user %s.", actor.pk, user.pk)

    for storage, name in stored:
        try:
            storage.delete(name)
        except Exception:
            logger.warning("Could not remove file %s after deleting a user.", name, exc_info=True)


# --------------------------------------------------
# Plans and templates
# --------------------------------------------------

def delete_plan(actor, plan: MembershipPlan) -> None:
    """A plan that anyone has ever subscribed to is kept (subscription and
    payment history point at it); deactivate it instead so it disappears
    from the pricing page."""

    if plan.subscriptions.exists():
        raise AdminError(
            "This plan has subscribers or subscription history, so it can't be deleted. "
            "Switch it to inactive to hide it from the pricing page.",
            code="in_use",
        )

    try:
        plan.delete()
    except ProtectedError:
        raise AdminError(
            "This plan is used by existing records, so it can't be deleted. Switch it to inactive instead.",
            code="in_use",
        )

    logger.info("Admin %s deleted plan %s.", actor.pk, plan.pk)


def delete_template(actor, template) -> None:
    try:
        template.delete()
    except ProtectedError:
        raise AdminError(
            "This template is used by existing invitations, so it can't be deleted. "
            "Switch it to inactive to hide it from organizers.",
            code="in_use",
        )

    logger.info("Admin %s deleted invitation template %s.", actor.pk, template.pk)


# --------------------------------------------------
# Reports
# --------------------------------------------------

def _window(days: int):
    """(first_day, last_day, start_of_first_day) in the site's time zone."""

    last_day = timezone.localdate()
    first_day = last_day - timedelta(days=days - 1)
    start = timezone.make_aware(datetime.combine(first_day, time.min))

    return first_day, last_day, start


def _paid_revenue_by_day(model, since) -> dict:
    rows = (
        model.objects.filter(status=model.Status.PAID, created_at__gte=since)
        .annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(amount=Sum("amount"))
    )

    return {row["day"]: row["amount"] for row in rows if row["day"] is not None}


def get_revenue_by_day(days: int = REPORT_DAYS) -> list[dict]:
    """Revenue for each of the last `days` days (plan payments + topup
    packs), 0 on quiet days."""

    _first, last_day, since = _window(days)

    combined: dict = {}

    for source in (_paid_revenue_by_day(Payment, since), _paid_revenue_by_day(TopupPurchase, since)):
        for day, amount in source.items():
            combined[day] = combined.get(day, ZERO_MONEY) + amount

    return [
        {"period": point["period"], "amount": point["value"]}
        for point in fill_daily_series(combined, last_day, days, zero=ZERO_MONEY)
    ]


def get_registrations_by_day(days: int = REPORT_DAYS) -> list[dict]:
    """New registrations for each of the last `days` days, 0 on quiet days."""

    _first, last_day, since = _window(days)

    rows = (
        User.objects.filter(created_at__gte=since)
        .annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(count=Count("id"))
    )

    counts = {row["day"]: row["count"] for row in rows if row["day"] is not None}

    return [
        {"period": point["period"], "count": point["value"]}
        for point in fill_daily_series(counts, last_day, days, zero=0)
    ]


def get_membership_statistics() -> list[dict]:
    """Subscribers per plan, counting only subscriptions that are active
    AND not past their end date."""

    rows = (
        MembershipPlan.objects.annotate(
            active_subscribers=Count(
                "subscriptions",
                filter=Q(
                    subscriptions__status=Subscription.Status.ACTIVE,
                    subscriptions__expires_at__gt=timezone.now(),
                ),
            )
        )
        .order_by("display_order", "price")
        .values("name", "active_subscribers")
    )

    return [{"plan_name": row["name"], "active_subscribers": row["active_subscribers"]} for row in rows]


def get_reports() -> dict:
    return {
        "revenue_by_period": get_revenue_by_day(),
        "registrations_by_period": get_registrations_by_day(),
        "active_events_count": Event.objects.filter(status=Event.Status.PUBLISHED).count(),
        "membership_statistics": get_membership_statistics(),
        "storage_usage_mb": get_storage_usage_mb(),
    }


# --------------------------------------------------
# Platform channel pools
# --------------------------------------------------

def list_channel_pools() -> list[PlatformChannelPool]:
    """Every channel's pool in a stable order. A channel never topped up has
    no row: it is returned as an UNSAVED placeholder (reported "not
    configured"), because creating a zero-capacity row on a plain page view
    would make the channel read as exhausted and block every send on it."""

    existing = {pool.channel: pool for pool in PlatformChannelPool.objects.all()}

    return [
        existing.get(value) or PlatformChannelPool(channel=value)
        for value, _label in PlatformChannelPool.Channel.choices
    ]


@transaction.atomic
def topup_channel_pool(
    channel: str,
    amount: int,
    note: str,
    admin_user: User,
    low_balance_threshold: int | None = None,
) -> PlatformChannelPool:
    """Add to a pool's total capacity and record it in the audit trail.
    The first topup creates the pool. The warning level can be changed in
    the same step."""

    pool, _created = PlatformChannelPool.objects.get_or_create(channel=channel)

    updates = {"total_capacity": F("total_capacity") + amount, "updated_at": timezone.now()}

    if low_balance_threshold is not None:
        updates["low_balance_threshold"] = low_balance_threshold

    PlatformChannelPool.objects.filter(pk=pool.pk).update(**updates)
    pool.refresh_from_db()

    PlatformPoolTopup.objects.create(pool=pool, amount=amount, note=note, topped_up_by=admin_user)
    logger.info("Admin %s topped up %s by %s.", admin_user.pk, channel, amount)

    return pool


def get_pool_topup_history(channel: str | None = None, limit: int = 50) -> list[PlatformPoolTopup]:
    queryset = PlatformPoolTopup.objects.select_related("pool", "topped_up_by").order_by("-created_at")

    if channel:
        queryset = queryset.filter(pool__channel=channel)

    return list(queryset[:limit])
