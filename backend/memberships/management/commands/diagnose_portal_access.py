"""Explain why a user is (or is not) let into the organizer portal.

READ-ONLY. It never changes anything: it uses plain queries instead of the
helpers that tidy overdue rows, and everything runs inside a transaction
that is always rolled back as a second safety net.

The output has no personal data (no name, mobile number or email): only the
user's internal id, flags, and their subscription history.

    python manage.py diagnose_portal_access --mobile 9876543210
    python manage.py diagnose_portal_access --user-id 42
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from memberships.models import Subscription


class Command(BaseCommand):
    help = "Read-only: explain the portal-access decision for one user (no personal data printed)."

    def add_arguments(self, parser):
        target = parser.add_mutually_exclusive_group(required=True)
        target.add_argument("--mobile", help="The user's mobile number, in any format.")
        target.add_argument("--user-id", type=int, help="The user's internal id.")
        parser.add_argument(
            "--history", type=int, default=5,
            help="How many of the newest subscriptions to list (default 5).",
        )

    def handle(self, *args, **options):
        with transaction.atomic():
            try:
                self._diagnose(options)
            finally:
                transaction.set_rollback(True)

    # ------------------------------------------------------------------

    def _find_user(self, options):
        if options["user_id"] is not None:
            return get_user_model().objects.filter(pk=options["user_id"]).first()

        from users.services import get_user_by_mobile

        return get_user_by_mobile(options["mobile"])

    def _line(self, label, value):
        self.stdout.write(f"  {label:<22} {value}")

    def _diagnose(self, options):
        user = self._find_user(options)

        if user is None:
            raise CommandError("No user found for that mobile number / id.")

        now = timezone.now()

        self.stdout.write(f"User id {user.pk}")
        self._line("role", user.role)
        self._line("is_verified", user.is_verified)
        self._line("is_active", user.is_active)
        self._line("is_suspended", getattr(user, "is_suspended", False))

        rows = list(
            Subscription.objects.select_related("plan")
            .filter(user=user)
            .order_by("-created_at")[: max(options["history"], 1)]
        )

        self.stdout.write(f"\nNewest subscriptions (server time now {now:%Y-%m-%d %H:%M %Z}):")

        if not rows:
            self.stdout.write("  (none)")

        for sub in rows:
            overdue = sub.expires_at <= now
            self.stdout.write(
                f"  #{sub.pk} plan={sub.plan.slug} (plan active={sub.plan.is_active}) "
                f"status={sub.status} started={sub.started_at:%Y-%m-%d} "
                f"expires={sub.expires_at:%Y-%m-%d %H:%M %Z}"
                f"{' [PAST]' if overdue else ''}"
                f"{f' cancelled={sub.cancelled_at:%Y-%m-%d}' if sub.cancelled_at else ''}"
                f" topup(inv/voice)={sub.invitations_topup}/{sub.voice_calls_topup}"
            )

        self.stdout.write(f"\nVerdict: {self._verdict(user, rows, now)}")

    def _verdict(self, user, rows, now) -> str:
        """Mirrors memberships.views.PortalAccessView, without any writes."""

        if getattr(user, "is_suspended", False) or not user.is_active:
            return "BLOCKED - the account is suspended or inactive, so it cannot sign in."

        if user.role == "ADMIN":
            return "ACCESS - admins always pass the portal check."

        if user.role != "ORGANIZER":
            return f"NOT A PORTAL USER - role {user.role} does not use the organizer portal."

        if not user.is_verified:
            return "verify_mobile - the mobile number is not verified yet."

        live = Subscription.objects.filter(
            user=user, status=Subscription.Status.ACTIVE, expires_at__gt=now
        ).exists()

        if live:
            return "ACCESS - has an ACTIVE subscription that has not expired."

        if not rows:
            return "select_plan - this user has never had a subscription."

        latest = rows[0]

        if latest.status == Subscription.Status.ACTIVE:
            return (
                f"select_plan - plan '{latest.plan.slug}' EXPIRED on "
                f"{latest.expires_at:%Y-%m-%d %H:%M %Z} (still marked ACTIVE; it is marked "
                "EXPIRED the next time the app checks)."
            )

        if latest.status == Subscription.Status.EXPIRED:
            return (
                f"select_plan - plan '{latest.plan.slug}' EXPIRED on "
                f"{latest.expires_at:%Y-%m-%d %H:%M %Z}."
            )

        return (
            f"select_plan - the newest subscription (#{latest.pk}) was CANCELLED and no "
            "active plan replaced it (check plan changes or admin edits)."
        )
