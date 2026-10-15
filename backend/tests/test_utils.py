import unittest
from datetime import datetime, timedelta, timezone
from src.utils import calculate_end_time, arrival_window, validate_operating_hours, base_amount, overtime, total_bill

class ParkHereUtilityTests(unittest.TestCase):
    def test_end_time_uses_fixed_month_duration(self):
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        self.assertEqual(calculate_end_time(start, 'month', 1), start + timedelta(days=30))

    def test_arrival_window_for_future_booking_starts_at_scheduled_start(self):
        now = datetime(2026, 1, 1, tzinfo=timezone.utc)
        start = now + timedelta(hours=3)
        window_start, deadline = arrival_window(start, now)
        self.assertEqual(window_start, start)
        self.assertEqual(deadline, start + timedelta(minutes=15))

    def test_arrival_window_for_booking_starting_now(self):
        now = datetime(2026, 1, 1, tzinfo=timezone.utc)
        window_start, deadline = arrival_window(now, now)
        self.assertEqual(window_start, now)
        self.assertEqual(deadline, now + timedelta(minutes=15))

    def test_daytime_operating_hours(self):
        location = {'is_24_7': False, 'opens_at': '06:00', 'closes_at': '22:00'}
        start = datetime(2026, 1, 1, 8, tzinfo=timezone.utc)
        self.assertTrue(validate_operating_hours(start, start + timedelta(hours=2), location)['valid'])
        self.assertFalse(validate_operating_hours(start, start + timedelta(hours=15), location)['valid'])

    def test_overnight_operating_hours(self):
        location = {'is_24_7': False, 'opens_at': '18:00', 'closes_at': '02:00'}
        start = datetime(2026, 1, 1, 23, tzinfo=timezone.utc)
        self.assertTrue(validate_operating_hours(start, start + timedelta(hours=2), location)['valid'])
        closed = datetime(2026, 1, 1, 12, tzinfo=timezone.utc)
        self.assertFalse(validate_operating_hours(closed, closed + timedelta(hours=1), location)['valid'])

    def test_pricing_and_overtime(self):
        self.assertEqual(base_amount(60, 2), 120.0)
        self.assertEqual(base_amount(100, 1, 'discounted', 25), 75.0)
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        result = overtime(start, start + timedelta(minutes=15, seconds=1), 1)
        self.assertEqual(result, {'overtime_minutes': 16, 'overtime_amount': 16.0})
        self.assertEqual(total_bill(60, 16, 0), 76.0)

if __name__ == '__main__':
    unittest.main()
