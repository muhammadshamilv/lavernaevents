from datetime import date
from types import SimpleNamespace
from unittest import mock

from django.test import SimpleTestCase

from . import services
from .helpers import fill_daily_series, last_n_days, normalize_admin_mobile


def _user(pk, role="ORGANIZER", active=True, suspended=False):
    return SimpleNamespace(pk=pk, role=role, is_active=active, is_suspended=suspended, save=mock.Mock())


class MobileNumberTests(SimpleTestCase):
    def test_every_typed_form_becomes_the_same_stored_number(self):
        for typed in ("9188560170", "+91 91885 60170", "919188560170", "09188560170"):
            self.assertEqual(normalize_admin_mobile(typed), "9188560170", typed)

    def test_foreign_number_keeps_its_country_code(self):
        self.assertEqual(normalize_admin_mobile("+44 7911 123456"), "447911123456")

    def test_letters_and_empty_are_rejected(self):
        for bad in ("98abc", "", "   "):
            with self.assertRaises(ValueError):
                normalize_admin_mobile(bad)

    def test_too_short_is_rejected(self):
        with self.assertRaises(ValueError):
            normalize_admin_mobile("+12345")


class DailySeriesTests(SimpleTestCase):
    def test_every_day_is_present_oldest_first(self):
        days = last_n_days(date(2026, 10, 8), 5)

        self.assertEqual(days[0], date(2026, 10, 4))
        self.assertEqual(days[-1], date(2026, 10, 8))
        self.assertEqual(len(days), 5)

    def test_quiet_days_are_zero(self):
        series = fill_daily_series({date(2026, 10, 7): 3}, date(2026, 10, 8), 3)

        self.assertEqual(
            series,
            [
                {"period": "2026-10-06", "value": 0},
                {"period": "2026-10-07", "value": 3},
                {"period": "2026-10-08", "value": 0},
            ],
        )

    def test_month_boundary(self):
        series = fill_daily_series({}, date(2026, 11, 2), 4)

        self.assertEqual([p["period"] for p in series], ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"])


class SelfProtectionTests(SimpleTestCase):
    def test_admin_cannot_suspend_or_delete_themselves(self):
        admin = _user(1, "ADMIN")

        for action in (services.suspend_user, services.delete_user):
            with self.assertRaises(services.AdminError) as caught:
                action(admin, admin)
            self.assertEqual(caught.exception.code, "cannot_modify_self")

    def test_admin_cannot_demote_or_deactivate_themselves(self):
        admin = _user(1, "ADMIN")

        for change in ({"role": "ORGANIZER"}, {"is_active": False}):
            with self.assertRaises(services.AdminError) as caught:
                services.check_user_update(admin, admin, change)
            self.assertEqual(caught.exception.code, "cannot_modify_self")

    def test_last_active_admin_is_protected_from_other_admins_too(self):
        actor, last = _user(1, "ADMIN"), _user(2, "ADMIN")

        with mock.patch.object(services, "_other_active_admins_exist", return_value=False):
            with self.assertRaises(services.AdminError) as caught:
                services.check_user_update(actor, last, {"role": "ORGANIZER"})
            self.assertEqual(caught.exception.code, "last_admin")

            with self.assertRaises(services.AdminError):
                services.suspend_user(actor, last)

            with self.assertRaises(services.AdminError):
                services.delete_user(actor, last)

    def test_another_admin_can_be_demoted_when_others_remain(self):
        actor, other = _user(1, "ADMIN"), _user(2, "ADMIN")

        with mock.patch.object(services, "_other_active_admins_exist", return_value=True):
            services.check_user_update(actor, other, {"role": "ORGANIZER"})  # no error

    def test_ordinary_edits_are_always_allowed(self):
        admin, organizer = _user(1, "ADMIN"), _user(2, "ORGANIZER")

        services.check_user_update(admin, organizer, {"role": "PHOTOGRAPHER", "is_active": False})
        services.check_user_update(admin, admin, {"full_name": "New name"})

    def test_suspending_an_organizer_works_and_is_saved(self):
        admin, organizer = _user(1, "ADMIN"), _user(2, "ORGANIZER")

        result = services.suspend_user(admin, organizer)

        self.assertTrue(result.is_suspended)
        organizer.save.assert_called_once()


class DeletePlanTests(SimpleTestCase):
    def test_plan_with_subscription_history_is_kept(self):
        plan = SimpleNamespace(pk=5, subscriptions=SimpleNamespace(exists=lambda: True), delete=mock.Mock())

        with self.assertRaises(services.AdminError) as caught:
            services.delete_plan(_user(1, "ADMIN"), plan)

        self.assertEqual(caught.exception.code, "in_use")
        plan.delete.assert_not_called()

    def test_unused_plan_is_deleted(self):
        plan = SimpleNamespace(pk=5, subscriptions=SimpleNamespace(exists=lambda: False), delete=mock.Mock())

        services.delete_plan(_user(1, "ADMIN"), plan)

        plan.delete.assert_called_once()
