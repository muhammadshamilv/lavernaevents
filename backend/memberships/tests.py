from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from invitations.models import InvitationTemplate

from .models import MembershipPlan, OrganizerTemplateLibrary, Subscription
from .utils import LimitExceededError, check_template_limit


class TemplateLimitTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            mobile_number="9000000001", password="Strong@Pass91", full_name="Org", email="org@example.com"
        )
        plan = MembershipPlan.objects.create(
            name="T", slug="t", price=0, duration_days=30, guest_limit=5, event_limit=1,
            storage_limit_mb=10, template_limit=1,
        )
        Subscription.objects.create(
            user=self.user, plan=plan, status=Subscription.Status.ACTIVE,
            expires_at=timezone.now() + timedelta(days=30),
        )

    def test_unsaved_template_can_be_checked(self):
        # A custom upload is checked BEFORE it is saved; this used to raise
        # "Model instances passed to related filters must be saved" (HTTP 500).
        check_template_limit(self.user, InvitationTemplate(name="Draft", channel="SMS", owner=self.user, is_custom=True))

    def test_unsaved_template_is_refused_when_the_library_is_full(self):
        saved = InvitationTemplate.objects.create(name="One", channel="SMS", body_text="x", owner=self.user, is_custom=True)
        OrganizerTemplateLibrary.objects.create(organizer=self.user, template=saved)

        with self.assertRaises(LimitExceededError):
            check_template_limit(self.user, InvitationTemplate(name="Two", channel="SMS", owner=self.user, is_custom=True))

        # A template already in the library can always be reused.
        check_template_limit(self.user, saved)
