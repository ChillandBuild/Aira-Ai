"""
Tests for attendance resolution pure functions.
No DB — only deterministic logic.
"""
import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.attendance import (
    resolve_day_status,
    date_range,
    build_attendance_map,
    compute_team_summary,
)


class TestResolveDayStatus(unittest.TestCase):
    def test_future_date_returns_future(self):
        today = date(2026, 6, 12)
        self.assertEqual(resolve_day_status(date(2026, 6, 13), today, None, True), "future")

    def test_override_wins_over_activity(self):
        today = date(2026, 6, 12)
        self.assertEqual(resolve_day_status(today, today, "absent", True), "absent")
        self.assertEqual(resolve_day_status(today, today, "present", False), "present")

    def test_derives_present_from_activity(self):
        today = date(2026, 6, 12)
        self.assertEqual(resolve_day_status(today, today, None, True), "present")

    def test_derives_absent_without_activity(self):
        today = date(2026, 6, 12)
        self.assertEqual(resolve_day_status(today, today, None, False), "absent")


class TestDateRange(unittest.TestCase):
    def test_inclusive_range(self):
        days = date_range(date(2026, 6, 1), date(2026, 6, 3))
        self.assertEqual(days, [date(2026, 6, 1), date(2026, 6, 2), date(2026, 6, 3)])

    def test_single_day(self):
        days = date_range(date(2026, 6, 1), date(2026, 6, 1))
        self.assertEqual(days, [date(2026, 6, 1)])


class TestBuildAttendanceMap(unittest.TestCase):
    def test_combines_overrides_and_activity(self):
        today = date(2026, 6, 3)
        days = date_range(date(2026, 6, 1), date(2026, 6, 4))
        overrides = {"2026-06-02": "absent"}
        active_dates = {"2026-06-01", "2026-06-02"}
        result = build_attendance_map(days, today, overrides, active_dates)
        self.assertEqual(result, {
            "2026-06-01": "present",
            "2026-06-02": "absent",  # override wins despite activity
            "2026-06-03": "absent",  # no activity, no override
            "2026-06-04": "future",
        })


class TestComputeTeamSummary(unittest.TestCase):
    def test_summary_counts_and_rate(self):
        grid = {
            "caller-1": {"2026-06-11": "present", "2026-06-12": "present"},
            "caller-2": {"2026-06-11": "absent", "2026-06-12": "absent"},
            "caller-3": {"2026-06-11": "present", "2026-06-12": "future"},
        }
        summary = compute_team_summary(grid, "2026-06-12")
        self.assertEqual(summary["present_today"], 1)
        self.assertEqual(summary["absent_today"], 1)
        self.assertEqual(summary["attendance_rate_month"], 0.6)


if __name__ == "__main__":
    unittest.main()
