from django.db import models
from .topup_models import PlatformChannelPool, PlatformPoolTopup, TopupPack, TopupPurchase  # noqa: F401


class MembershipPlan(models.Model):
    """A subscription plan that controls feature limits for organizers.

    Phase 15: the plan no longer grants access to a curated SET of
    specific InvitationTemplate rows (the old `templates` M2M). Instead
    it grants a COUNT (`template_limit`) of how many templates - platform
    or the organizer's own custom uploads - the organizer may have in
    their library at once. Separately, `total_invitations` is a single
    shared pool spendable across WhatsApp/Email/SMS sends (decremented
    per guest per successful send, in the invitations app's service
    layer), and `voice_call_limit` is its own distinct pool since a
    voice call costs far more per unit than a text-based send.
    """

    name = models.CharField(
        max_length=100,
        unique=True,
    )

    slug = models.SlugField(
        max_length=120,
        unique=True,
    )

    description = models.TextField(
        blank=True,
    )

    price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
    )

    duration_days = models.PositiveIntegerField(
        default=30,
        help_text="Number of days this plan is valid for after activation.",
    )

    guest_limit = models.PositiveIntegerField(
        default=50,
        help_text="Maximum number of guests allowed per event.",
    )

    event_limit = models.PositiveIntegerField(
        default=1,
        help_text="Maximum number of active events allowed.",
    )

    total_invitations = models.PositiveIntegerField(
        default=100,
        null=True,
        blank=True,
        help_text=(
            "Total invitation sends allowed for the subscription's lifetime, "
            "shared across WhatsApp, Email, and SMS channels. Null means "
            "unlimited."
        ),
    )

    template_limit = models.PositiveIntegerField(
        default=5,
        null=True,
        blank=True,
        help_text=(
            "Maximum number of templates (platform-provided plus the "
            "organizer's own custom uploads) usable on this plan. Null "
            "means unlimited."
        ),
    )

    voice_call_limit = models.PositiveIntegerField(
        default=0,
        null=True,
        blank=True,
        help_text=(
            "Total automated voice-call invitations allowed for the "
            "subscription's lifetime. Separate from total_invitations "
            "since a call costs far more per unit than a text-based send. "
            "Null means unlimited, 0 means voice calling is not available "
            "on this plan."
        ),
    )

    storage_limit_mb = models.PositiveIntegerField(
        default=500,
        help_text="Maximum media storage allowed, in megabytes.",
    )

    gallery_enabled = models.BooleanField(
        default=True,
    )

    qr_code_enabled = models.BooleanField(
        default=True,
    )

    photographer_access_enabled = models.BooleanField(
        default=False,
    )

    is_active = models.BooleanField(
        default=True,
        help_text="Inactive plans are hidden from new subscriptions.",
    )

    display_order = models.PositiveIntegerField(
        default=0,
        help_text="Controls the order plans are shown on the pricing page.",
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    updated_at = models.DateTimeField(
        auto_now=True,
    )

    class Meta:
        db_table = "membership_plans"
        ordering = ["display_order", "price"]

    def __str__(self) -> str:
        return self.name


class Subscription(models.Model):
    """Tracks a user's active or historical membership plan subscription."""

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        EXPIRED = "EXPIRED", "Expired"
        CANCELLED = "CANCELLED", "Cancelled"

    user = models.ForeignKey(
        "users.User",
        on_delete=models.CASCADE,
        related_name="subscriptions",
    )

    plan = models.ForeignKey(
        MembershipPlan,
        on_delete=models.PROTECT,
        related_name="subscriptions",
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE,
    )

    # Phase 15: usage counters. These track consumption against the
    # plan's total_invitations / voice_call_limit for THIS subscription's
    # lifetime. A new Subscription (e.g. after upgrade/renewal) starts
    # these back at 0, i.e. quota does not carry over between separate
    # Subscription rows - matching how `expires_at` already resets per
    # subscription rather than accumulating.
    invitations_used = models.PositiveIntegerField(
        default=0,
        help_text="Invitations sent so far (WhatsApp+Email+SMS combined) against this subscription's total_invitations.",
    )

    voice_calls_used = models.PositiveIntegerField(
        default=0,
        help_text="Automated voice calls placed so far against this subscription's voice_call_limit.",
    )

    # Phase 26: extra allowance bought via TopupPurchase, ON TOP OF the
    # plan's own total_invitations/voice_call_limit. Added to the plan's
    # base limit when computing *_remaining() below - a topup never
    # replaces or resets the plan limit, it only extends it. The UNUSED part
    # of a topup carries over to the new Subscription row when the organizer
    # upgrades/downgrades/renews (see memberships.services.activate_plan_for_user),
    # because the organizer paid real money for it. Plan usage itself
    # (invitations_used/voice_calls_used) starts again at 0.
    invitations_topup = models.PositiveIntegerField(
        default=0,
        help_text="Extra invitation allowance purchased via TopupPurchase, added on top of the plan's total_invitations.",
    )

    voice_calls_topup = models.PositiveIntegerField(
        default=0,
        help_text="Extra voice-call allowance purchased via TopupPurchase, added on top of the plan's voice_call_limit.",
    )

    started_at = models.DateTimeField(
        auto_now_add=True,
    )

    expires_at = models.DateTimeField()

    cancelled_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    updated_at = models.DateTimeField(
        auto_now=True,
    )

    class Meta:
        db_table = "subscriptions"
        ordering = ["-created_at"]
        constraints = [
            # A user can only ever have ONE active subscription. Enforced by
            # the database so two simultaneous requests / webhooks can never
            # leave a user with two active plans.
            models.UniqueConstraint(
                fields=["user"],
                condition=models.Q(status="ACTIVE"),
                name="unique_active_subscription_per_user",
            )
        ]
        indexes = [
            models.Index(fields=["status", "expires_at"], name="sub_status_expiry_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.user.mobile_number} - {self.plan.name} ({self.status})"

    def invitations_remaining(self) -> int | None:
        """Return remaining invitation quota (plan + topups), or None if
        the plan itself is unlimited."""

        if self.plan.total_invitations is None:
            return None

        effective_total = self.plan.total_invitations + self.invitations_topup

        return max(effective_total - self.invitations_used, 0)

    def voice_calls_remaining(self) -> int | None:
        """Return remaining voice-call quota (plan + topups), or None if
        the plan itself is unlimited."""

        if self.plan.voice_call_limit is None:
            return None

        effective_total = self.plan.voice_call_limit + self.voice_calls_topup

        return max(effective_total - self.voice_calls_used, 0)


class OrganizerTemplateLibrary(models.Model):
    """Tracks which specific templates an organizer has added to their library.

    Phase 17. Replaces the old `plan.templates` M2M (which named specific
    templates as part of the PLAN definition) now that template_limit is
    just a COUNT on the plan. This table is the actual record of which
    templates a given ORGANIZER has added, so the count can be enforced
    and reused templates aren't charged twice.

    A row is created the first time an organizer either generates an
    invitation using a platform template, or uploads a custom template of
    their own (see invitations/services.py's get_or_create_invitation and
    create_custom_template). Once added, that template is free to reuse
    an unlimited number of times - only ADDING a never-before-used
    template consumes a template_limit slot.

    Not scoped to a Subscription (unlike Subscription.invitations_used),
    so a template added under one plan stays in the organizer's library
    even if they later upgrade/downgrade/renew - only the limit enforced
    against the count changes. This mirrors how a media library wouldn't
    be wiped by a plan change.
    """

    organizer = models.ForeignKey(
        "users.User",
        on_delete=models.CASCADE,
        related_name="template_library_entries",
    )

    template = models.ForeignKey(
        "invitations.InvitationTemplate",
        on_delete=models.CASCADE,
        related_name="library_entries",
    )

    added_at = models.DateTimeField(
        auto_now_add=True,
    )

    class Meta:
        db_table = "organizer_template_library"
        ordering = ["-added_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["organizer", "template"],
                name="unique_organizer_template_library_entry",
            )
        ]

    def __str__(self) -> str:
        return f"{self.organizer.mobile_number} - {self.template.name}"
