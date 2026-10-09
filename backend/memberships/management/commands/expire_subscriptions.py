from django.core.management.base import BaseCommand

from memberships.services import dedupe_active_subscriptions, expire_overdue_subscriptions


class Command(BaseCommand):
    help = (
        "Mark overdue subscriptions as EXPIRED and cancel duplicate ACTIVE "
        "subscriptions (keeps each user's newest one). Safe to run any time; "
        "schedule it daily on the server."
    )

    def handle(self, *args, **options):
        duplicates = dedupe_active_subscriptions()
        expired = expire_overdue_subscriptions()

        self.stdout.write(
            self.style.SUCCESS(
                f"Cancelled {duplicates} duplicate active subscription(s); "
                f"expired {expired} overdue subscription(s)."
            )
        )
