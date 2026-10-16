import unittest
import secrets
import time
from datetime import datetime, timedelta, timezone
from src.db import query, transaction
from src.booking_routes import expire_and_complete_overdue_sessions
from src.utils import arrival_window

class BookingLifecycleIntegrationTests(unittest.TestCase):
    def setUp(self):
        user_res = query("SELECT id FROM users WHERE role = 'customer' LIMIT 1")
        self.user_id = user_res['rows'][0]['id'] if user_res['rows'] else None

        admin_res = query("SELECT id FROM users WHERE role IN ('platform_admin', 'owner', 'org_admin') LIMIT 1")
        self.verifier_id = admin_res['rows'][0]['id'] if admin_res['rows'] else self.user_id

        loc_res = query("SELECT id FROM parking_locations LIMIT 1")
        self.location_id = loc_res['rows'][0]['id'] if loc_res['rows'] else None

        self.created_booking_ids = []

    def tearDown(self):
        if self.created_booking_ids:
            with transaction() as t:
                for b_id in self.created_booking_ids:
                    t.query("DELETE FROM payments WHERE booking_id = $1", [b_id])
                    t.query("DELETE FROM invoices WHERE booking_id = $1", [b_id])
                    t.query("DELETE FROM parking_sessions WHERE booking_id = $1", [b_id])
                    t.query("DELETE FROM booking_addons WHERE booking_id = $1", [b_id])
                    t.query("DELETE FROM booking_events WHERE booking_id = $1", [b_id])
                    t.query("DELETE FROM bookings WHERE id = $1", [b_id])

    def _create_booking_reference(self):
        return f"TEST-{int(time.time()*1000):x}-{secrets.token_hex(2).upper()}".upper()

    def test_overdue_active_session_transitions_to_completed_with_pending_bill(self):
        now = datetime.now(timezone.utc)
        start_time = now - timedelta(hours=2)
        end_time = now - timedelta(minutes=30)
        window_start, deadline = arrival_window(start_time, start_time)
        ref = self._create_booking_reference()

        with transaction() as t:
            res = t.query("""
                INSERT INTO bookings (
                    booking_reference, customer_id, location_id, pool,
                    vehicle_type, vehicle_number, start_time, end_time,
                    status, arrival_window_start, arrival_deadline,
                    rate_type, quantity, unit_price_snapshot,
                    benefit_applied, discount_percent_snapshot,
                    base_amount_snapshot, overtime_rate_snapshot
                ) VALUES (
                    $1, $2, $3, 'public',
                    'four_wheeler', 'TN-23-TEST-001', $4, $5,
                    'active', $6, $7,
                    'hour', 1, 50.00,
                    'none', 0.00,
                    50.00, 1.00
                ) RETURNING id
            """, [
                ref, self.user_id, self.location_id,
                start_time, end_time, window_start, deadline
            ])
            booking_id = res['rows'][0]['id']
            self.created_booking_ids.append(booking_id)

            t.query("""
                INSERT INTO parking_sessions (booking_id, entry_time, verified_by_user_id, spot_label)
                VALUES ($1, $2, $3, 'P-TEST-1')
            """, [booking_id, start_time, self.verifier_id])

        # Run expiry logic
        processed = expire_and_complete_overdue_sessions()
        self.assertGreaterEqual(processed, 1, "Should have processed at least 1 overdue booking")

        # Check booking status
        b_res = query("SELECT status FROM bookings WHERE id = $1", [booking_id])
        status = b_res['rows'][0]['status']
        self.assertEqual(status, 'completed', "Overdue active booking must transition to 'completed'")

        # Check parking_sessions exit_time
        s_res = query("SELECT exit_time FROM parking_sessions WHERE booking_id = $1", [booking_id])
        session = s_res['rows'][0]
        self.assertIsNotNone(session['exit_time'], "Exit time must be recorded")

        # Check invoice was generated
        inv_res = query("SELECT * FROM invoices WHERE booking_id = $1", [booking_id])
        self.assertTrue(len(inv_res['rows']) > 0, "Invoice must be generated")
        invoice = inv_res['rows'][0]
        self.assertEqual(float(invoice['base_amount']), 50.00)
        self.assertGreaterEqual(float(invoice['total_amount']), 50.00)

        # Check payment was created with 'pending' status (NOT 'paid')
        pay_res = query("SELECT * FROM payments WHERE booking_id = $1", [booking_id])
        self.assertTrue(len(pay_res['rows']) > 0, "Payment record must exist")
        payment = pay_res['rows'][0]
        self.assertEqual(payment['status'], 'pending', "Payment must remain 'pending' and not falsely marked paid")

    def test_future_active_session_remains_active(self):
        now = datetime.now(timezone.utc)
        start_time = now - timedelta(minutes=10)
        end_time = now + timedelta(minutes=50)
        window_start, deadline = arrival_window(start_time, start_time)
        ref = self._create_booking_reference()

        with transaction() as t:
            res = t.query("""
                INSERT INTO bookings (
                    booking_reference, customer_id, location_id, pool,
                    vehicle_type, vehicle_number, start_time, end_time,
                    status, arrival_window_start, arrival_deadline,
                    rate_type, quantity, unit_price_snapshot,
                    benefit_applied, discount_percent_snapshot,
                    base_amount_snapshot, overtime_rate_snapshot
                ) VALUES (
                    $1, $2, $3, 'public',
                    'four_wheeler', 'TN-23-TEST-002', $4, $5,
                    'active', $6, $7,
                    'hour', 1, 50.00,
                    'none', 0.00,
                    50.00, 1.00
                ) RETURNING id
            """, [
                ref, self.user_id, self.location_id,
                start_time, end_time, window_start, deadline
            ])
            booking_id = res['rows'][0]['id']
            self.created_booking_ids.append(booking_id)

            t.query("""
                INSERT INTO parking_sessions (booking_id, entry_time, verified_by_user_id, spot_label)
                VALUES ($1, $2, $3, 'P-TEST-2')
            """, [booking_id, start_time, self.verifier_id])

        expire_and_complete_overdue_sessions()

        b_res = query("SELECT status FROM bookings WHERE id = $1", [booking_id])
        status = b_res['rows'][0]['status']
        self.assertEqual(status, 'active', "Future active booking must remain 'active'")

    def test_overdue_pending_booking_expires(self):
        now = datetime.now(timezone.utc)
        start_time = now - timedelta(hours=1)
        end_time = now + timedelta(hours=1)
        window_start, deadline = arrival_window(start_time, start_time)
        ref = self._create_booking_reference()

        with transaction() as t:
            res = t.query("""
                INSERT INTO bookings (
                    booking_reference, customer_id, location_id, pool,
                    vehicle_type, vehicle_number, start_time, end_time,
                    status, arrival_window_start, arrival_deadline,
                    rate_type, quantity, unit_price_snapshot,
                    benefit_applied, discount_percent_snapshot,
                    base_amount_snapshot, overtime_rate_snapshot
                ) VALUES (
                    $1, $2, $3, 'public',
                    'four_wheeler', 'TN-23-TEST-003', $4, $5,
                    'pending', $6, $7,
                    'hour', 2, 80.00,
                    'none', 0.00,
                    80.00, 1.00
                ) RETURNING id
            """, [
                ref, self.user_id, self.location_id,
                start_time, end_time, window_start, deadline
            ])
            booking_id = res['rows'][0]['id']
            self.created_booking_ids.append(booking_id)

        expire_and_complete_overdue_sessions()

        b_res = query("SELECT status FROM bookings WHERE id = $1", [booking_id])
        status = b_res['rows'][0]['status']
        self.assertEqual(status, 'expired', "Overdue pending booking must transition to 'expired'")

    def test_idempotent_expiry_execution(self):
        now = datetime.now(timezone.utc)
        start_time = now - timedelta(hours=3)
        end_time = now - timedelta(hours=1)
        window_start, deadline = arrival_window(start_time, start_time)
        ref = self._create_booking_reference()

        with transaction() as t:
            res = t.query("""
                INSERT INTO bookings (
                    booking_reference, customer_id, location_id, pool,
                    vehicle_type, vehicle_number, start_time, end_time,
                    status, arrival_window_start, arrival_deadline,
                    rate_type, quantity, unit_price_snapshot,
                    benefit_applied, discount_percent_snapshot,
                    base_amount_snapshot, overtime_rate_snapshot
                ) VALUES (
                    $1, $2, $3, 'public',
                    'four_wheeler', 'TN-23-TEST-004', $4, $5,
                    'active', $6, $7,
                    'hour', 2, 100.00,
                    'none', 0.00,
                    100.00, 1.00
                ) RETURNING id
            """, [
                ref, self.user_id, self.location_id,
                start_time, end_time, window_start, deadline
            ])
            booking_id = res['rows'][0]['id']
            self.created_booking_ids.append(booking_id)

            t.query("""
                INSERT INTO parking_sessions (booking_id, entry_time, verified_by_user_id, spot_label)
                VALUES ($1, $2, $3, 'P-TEST-3')
            """, [booking_id, start_time, self.verifier_id])

        # Run multiple times to verify idempotence
        expire_and_complete_overdue_sessions()
        expire_and_complete_overdue_sessions()
        expire_and_complete_overdue_sessions()

        inv_res = query("SELECT COUNT(*) as c FROM invoices WHERE booking_id = $1", [booking_id])
        invoice_count = inv_res['rows'][0]['c']
        self.assertEqual(invoice_count, 1, "Must have exactly 1 invoice despite repeated sweeps")

        pay_res = query("SELECT COUNT(*) as c FROM payments WHERE booking_id = $1", [booking_id])
        payment_count = pay_res['rows'][0]['c']
        self.assertEqual(payment_count, 1, "Must have exactly 1 payment record despite repeated sweeps")

    def test_occupancy_released_after_auto_completion(self):
        now = datetime.now(timezone.utc)
        start_time = now - timedelta(hours=2)
        end_time = now - timedelta(minutes=10)
        window_start, deadline = arrival_window(start_time, start_time)
        ref = self._create_booking_reference()

        with transaction() as t:
            res = t.query("""
                INSERT INTO bookings (
                    booking_reference, customer_id, location_id, pool,
                    vehicle_type, vehicle_number, start_time, end_time,
                    status, arrival_window_start, arrival_deadline,
                    rate_type, quantity, unit_price_snapshot,
                    benefit_applied, discount_percent_snapshot,
                    base_amount_snapshot, overtime_rate_snapshot
                ) VALUES (
                    $1, $2, $3, 'public',
                    'four_wheeler', 'TN-23-TEST-005', $4, $5,
                    'active', $6, $7,
                    'hour', 1, 50.00,
                    'none', 0.00,
                    50.00, 1.00
                ) RETURNING id
            """, [
                ref, self.user_id, self.location_id,
                start_time, end_time, window_start, deadline
            ])
            booking_id = res['rows'][0]['id']
            self.created_booking_ids.append(booking_id)

            t.query("""
                INSERT INTO parking_sessions (booking_id, entry_time, verified_by_user_id, spot_label)
                VALUES ($1, $2, $3, 'P-TEST-5')
            """, [booking_id, start_time, self.verifier_id])

        # Prior to expiry sweep, it was occupying capacity
        occ_before = query("SELECT COUNT(*) as c FROM v_occupying_bookings WHERE booking_id = $1", [booking_id])
        self.assertEqual(occ_before['rows'][0]['c'], 1, "Active booking occupies capacity in view")

        # Run expiry
        expire_and_complete_overdue_sessions()

        # After expiry sweep, status is 'completed' and capacity is released
        occ_after = query("SELECT COUNT(*) as c FROM v_occupying_bookings WHERE booking_id = $1", [booking_id])
        self.assertEqual(occ_after['rows'][0]['c'], 0, "Completed booking must NOT occupy capacity in v_occupying_bookings")

if __name__ == '__main__':
    unittest.main()

