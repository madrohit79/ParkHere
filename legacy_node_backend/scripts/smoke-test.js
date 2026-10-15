/**
 * ParkHere Comprehensive End-to-End Smoke Test Suite
 * Tests all 11 required scenarios from Section 12 using built-in fetch and raw PostgreSQL client.
 */

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const API_BASE = 'http://localhost:5000/api';
const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/parkhere';

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`  ✅ PASSED: ${message}`);
}

async function api(endpoint, method = 'GET', body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });

  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data: json };
}

async function runSmokeTests() {
  console.log('\n===========================================================');
  console.log('   PARKHERE END-TO-END SMOKE TEST SUITE (SECTION 12)');
  console.log('===========================================================\n');

  const dbClient = new Client({ connectionString: DB_URL });
  await dbClient.connect();

  // Clean previous smoke test artifacts to ensure idempotence
  await dbClient.query(`
    DELETE FROM payments WHERE booking_id IN (SELECT id FROM bookings WHERE vehicle_number LIKE 'TN23-SMOKE-%' OR vehicle_number LIKE 'TN23-CONCUR-%' OR vehicle_number LIKE 'TN23-EXP-%' OR vehicle_number LIKE 'TN23-CAN-%' OR vehicle_number LIKE 'TN23-OPHR-%');
    DELETE FROM invoices WHERE booking_id IN (SELECT id FROM bookings WHERE vehicle_number LIKE 'TN23-SMOKE-%' OR vehicle_number LIKE 'TN23-CONCUR-%' OR vehicle_number LIKE 'TN23-EXP-%' OR vehicle_number LIKE 'TN23-CAN-%' OR vehicle_number LIKE 'TN23-OPHR-%');
    DELETE FROM parking_sessions WHERE booking_id IN (SELECT id FROM bookings WHERE vehicle_number LIKE 'TN23-SMOKE-%' OR vehicle_number LIKE 'TN23-CONCUR-%' OR vehicle_number LIKE 'TN23-EXP-%' OR vehicle_number LIKE 'TN23-CAN-%' OR vehicle_number LIKE 'TN23-OPHR-%');
    DELETE FROM booking_addons WHERE booking_id IN (SELECT id FROM bookings WHERE vehicle_number LIKE 'TN23-SMOKE-%' OR vehicle_number LIKE 'TN23-CONCUR-%' OR vehicle_number LIKE 'TN23-EXP-%' OR vehicle_number LIKE 'TN23-CAN-%' OR vehicle_number LIKE 'TN23-OPHR-%');
    DELETE FROM bookings WHERE vehicle_number LIKE 'TN23-SMOKE-%' OR vehicle_number LIKE 'TN23-CONCUR-%' OR vehicle_number LIKE 'TN23-EXP-%' OR vehicle_number LIKE 'TN23-CAN-%' OR vehicle_number LIKE 'TN23-OPHR-%';
    DELETE FROM customer_memberships WHERE org_member_id IN (SELECT id FROM org_members WHERE member_identifier = 'SMOKE-MEM-99');
    DELETE FROM org_members WHERE member_identifier = 'SMOKE-MEM-99';
    DELETE FROM parking_locations WHERE name LIKE 'Approved New Owner%' OR name LIKE 'Operating Hours%';
    DELETE FROM organisations WHERE org_identifier LIKE 'NEW-CAMPUS-%';
    DELETE FROM users WHERE email LIKE '%@test.local' OR email = 'hacker@example.com';
  `);

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Register, Login, RBAC & Role Escalation Protection
    // ------------------------------------------------------------------------
    console.log('--- TEST 1: Register, Login, RBAC & Role Escalation Protection ---');

    // 1.1 Role escalation protection: Registering platform_admin must be rejected
    const escalateRes = await api('/auth/register', 'POST', {
      email: 'hacker@example.com',
      password: 'Password123!',
      full_name: 'Hacker User',
      role: 'platform_admin'
    });
    assert(escalateRes.status === 403, 'Role escalation to platform_admin is rejected with 403');

    // 1.2 Customer registration & login
    const custReg = await api('/auth/register', 'POST', {
      email: 'newcustomer@test.local',
      password: 'Password123!',
      full_name: 'Test Customer',
      phone: '+91 9999900001',
      role: 'customer'
    });
    assert(custReg.status === 201 && custReg.data.data.token, 'Customer registers successfully');
    const customerToken = custReg.data.data.token;

    // 1.3 Customer cannot access admin routes (403)
    const custAdminCheck = await api('/admin/stats', 'GET', null, customerToken);
    assert(custAdminCheck.status === 403, 'Customer blocked from /api/admin with 403');

    // 1.4 Customer cannot access provider routes (403)
    const custOwnerCheck = await api('/owner/profile', 'GET', null, customerToken);
    assert(custOwnerCheck.status === 403, 'Customer blocked from /api/owner with 403');

    // 1.5 Register unapproved owner
    const ownerReg = await api('/auth/register', 'POST', {
      email: 'newowner@test.local',
      password: 'Password123!',
      full_name: 'Pending Owner',
      business_name: 'Pending Spaces LLC',
      role: 'owner'
    });
    assert(ownerReg.status === 201, 'Unapproved owner registers successfully with pending status');
    const unapprovedOwnerToken = ownerReg.data.data.token;

    // 1.6 Unapproved owner cannot create parking listing (403)
    const unapprovedCreate = await api('/locations', 'POST', {
      name: 'Illegal Lot',
      address: 'Nowhere',
      locality: 'Katpadi',
      public_capacity: 10,
      hourly_rate: 50
    }, unapprovedOwnerToken);
    assert(unapprovedCreate.status === 403, 'Unapproved owner cannot publish listings (403)');

    // 1.7 Login platform admin (seeded)
    const adminLogin = await api('/auth/login', 'POST', {
      email: 'admin@parkhere.local',
      password: 'Password123!'
    });
    assert(adminLogin.status === 200 && adminLogin.data.data.token, 'Platform admin logs in successfully');
    const adminToken = adminLogin.data.data.token;

    // ------------------------------------------------------------------------
    // TEST 2: Platform Admin Approves Owner & Organisation
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 2: Platform Admin Approves Owner & Organisation ---');

    // Register an unapproved organisation
    const orgReg = await api('/auth/register', 'POST', {
      email: 'neworg@test.local',
      password: 'Password123!',
      full_name: 'New Org Admin',
      org_name: 'New Campus Services',
      org_identifier: 'NEW-CAMPUS-ORG',
      role: 'org_admin'
    });
    assert(orgReg.status === 201, 'New organisation registers with pending status');
    const orgAdminToken = orgReg.data.data.token;
    const newOrgId = orgReg.data.data.org.id;
    const newOwnerProfileId = ownerReg.data.data.ownerProfile.id;

    // Approve the new organisation
    const approveOrgRes = await api(`/admin/organisations/${newOrgId}/approve`, 'POST', {}, adminToken);
    assert(approveOrgRes.status === 200, 'Platform admin approves organisation');

    // Approve the new owner
    const approveOwnerRes = await api(`/admin/owners/${newOwnerProfileId}/approve`, 'POST', {}, adminToken);
    assert(approveOwnerRes.status === 200, 'Platform admin approves owner');

    // Re-login approved owner to verify publishing is now allowed
    const ownerLogin = await api('/auth/login', 'POST', {
      email: 'newowner@test.local',
      password: 'Password123!'
    });
    const approvedOwnerToken = ownerLogin.data.data.token;

    const createLocRes = await api('/locations', 'POST', {
      name: 'Approved New Owner Parking',
      address: '100 New Street',
      locality: 'Katpadi',
      public_capacity: 5,
      hourly_rate: 60,
      overtime_rate_per_minute: 1.00,
      vehicle_types: ['four_wheeler', 'two_wheeler']
    }, approvedOwnerToken);
    assert(createLocRes.status === 201, 'Approved owner can now create and publish parking location');
    const testLocationId = createLocRes.data.data.id;

    // ------------------------------------------------------------------------
    // TEST 3: Organisation Member Addition & Customer Verification
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 3: Organisation Member Addition & Customer Verification ---');

    // Org admin logs in (DEMO-ORG)
    const demoOrgLogin = await api('/auth/login', 'POST', {
      email: 'orgadmin@parkhere.local',
      password: 'Password123!'
    });
    const demoOrgToken = demoOrgLogin.data.data.token;

    // Add a new member record
    const addMemberRes = await api('/org/members', 'POST', {
      member_identifier: 'SMOKE-MEM-99',
      full_name: 'Test Customer',
      email: 'newcustomer@test.local',
      phone: '+91 9999900001',
      parking_benefit: 'discounted'
    }, demoOrgToken);
    assert(addMemberRes.status === 201, 'Org admin adds member record');

    // 3.1 Failure: verification with organisation identifier alone
    const verifyMissing = await api('/membership/verify', 'POST', {
      org_identifier: 'DEMO-ORG',
      member_identifier: '',
      full_name: '',
      email: ''
    }, customerToken);
    assert(verifyMissing.status === 400, 'Verification fails if only org identifier is supplied');

    // 3.2 Failure: verification with mismatched details
    const verifyMismatch = await api('/membership/verify', 'POST', {
      org_identifier: 'DEMO-ORG',
      member_identifier: 'SMOKE-MEM-99',
      full_name: 'Wrong Name',
      email: 'newcustomer@test.local'
    }, customerToken);
    assert(verifyMismatch.status === 400, 'Verification fails with mismatched full name');

    // 3.3 Success: verification with matching details
    const verifySuccess = await api('/membership/verify', 'POST', {
      org_identifier: 'DEMO-ORG',
      member_identifier: 'SMOKE-MEM-99',
      full_name: 'Test Customer',
      email: 'newcustomer@test.local'
    }, customerToken);
    assert(verifySuccess.status === 201 && verifySuccess.data.data.parking_benefit === 'discounted',
      'Customer verifies membership with matching details and receives discounted benefit');

    // ------------------------------------------------------------------------
    // TEST 4: Search Filters & Availability
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 4: Search Filters & Live Availability Calculation ---');

    const searchLocality = await api('/locations?locality=Katpadi');
    assert(searchLocality.status === 200 && searchLocality.data.data.length > 0, 'Search by locality returns results');

    const searchVehicle = await api('/locations?vehicle_type=four_wheeler');
    assert(searchVehicle.status === 200 && searchVehicle.data.data.length > 0, 'Filter by vehicle type works');

    const searchPrice = await api('/locations?max_price=35');
    assert(searchPrice.status === 200 && searchPrice.data.data.every(l => Number(l.hourly_rate) <= 35),
      'Filter by max_price returns only locations with rate <= 35');

    const searchCCTV = await api('/locations?has_cctv=true');
    assert(searchCCTV.status === 200 && searchCCTV.data.data.every(l => l.has_cctv === true),
      'Filter by CCTV returns only locations with CCTV');

    // ------------------------------------------------------------------------
    // TEST 5: Booking Creation, 6-digit Arrival Code & Price Snapshot
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 5: Booking Creation, Arrival Code & Price Snapshot ---');

    // Estimate first
    const estimateRes = await api('/bookings/estimate', 'POST', {
      location_id: testLocationId,
      pool: 'public',
      rate_type: 'hour',
      quantity: 1
    }, customerToken);
    assert(estimateRes.status === 200 && Number(estimateRes.data.data.total_amount) === 60.00,
      'Price estimation calculates ₹60.00 base');

    // Create booking
    const bookRes = await api('/bookings', 'POST', {
      location_id: testLocationId,
      pool: 'public',
      vehicle_type: 'four_wheeler',
      vehicle_number: 'TN23-SMOKE-01',
      rate_type: 'hour',
      quantity: 1
    }, customerToken);

    assert(bookRes.status === 201, 'Booking created successfully');
    const bookingData = bookRes.data.data;
    const bookingId = bookingData.id;

    // Verify code is not generated at booking time (arrival_code: null)
    assert(bookingData.arrival_code === null, 'Arrival code is initially null awaiting operator generation');

    // Verify 15-minute deadline
    const windowStart = new Date(bookingData.arrival_window_start).getTime();
    const deadline = new Date(bookingData.arrival_deadline).getTime();
    assert(deadline - windowStart === 15 * 60 * 1000, 'Arrival deadline is exactly 15 minutes after window start');

    // Verify price snapshot equals estimate
    assert(Number(bookingData.base_amount_snapshot) === 60.00, 'Snapshotted base amount matches estimated price (₹60)');

    // ------------------------------------------------------------------------
    // TEST 6: Concurrency Over-Allocation Prevention
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 6: Concurrency Over-Allocation Prevention (Promise.all) ---');

    // Location `testLocationId` has public_capacity = 5. Currently 1 is booked (4 remaining).
    // Fire 6 simultaneous booking requests. Exactly 4 must succeed and 2 must receive 409!
    const concurrentPromises = [];
    for (let i = 0; i < 6; i++) {
      concurrentPromises.push(
        api('/bookings', 'POST', {
          location_id: testLocationId,
          pool: 'public',
          vehicle_type: 'four_wheeler',
          vehicle_number: `TN23-CONCUR-${i}`,
          rate_type: 'hour',
          quantity: 1
        }, customerToken)
      );
    }

    const concurrentResults = await Promise.all(concurrentPromises);
    const successCount = concurrentResults.filter(r => r.status === 201).length;
    const conflictCount = concurrentResults.filter(r => r.status === 409).length;

    assert(successCount === 4, `Exactly remaining capacity (${successCount}/4) concurrent bookings succeeded`);
    assert(conflictCount === 2, `Over-capacity bookings (${conflictCount}/2) rejected with 409 Conflict`);

    // ------------------------------------------------------------------------
    // TEST 7: Operator Generates Code, Driver Enters Code, Single-Use & Isolation
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 7: Operator Generates Code, Driver Enters Code, Single-Use & Isolation ---');

    // 7.1 Cross-operator isolation: An unauthorized operator cannot generate gate code
    const wrongOperatorRes = await api(`/bookings/${bookingId}/generate-code`, 'POST', {
      spot_label: 'BAY-12'
    }, demoOrgToken); // demoOrg does not own testLocationId
    assert(wrongOperatorRes.status === 403, 'Cross-operator gate code generation rejected with 403');

    // 7.2 Customer cannot generate gate code (operator only)
    const custGenRes = await api(`/bookings/${bookingId}/generate-code`, 'POST', {
      spot_label: 'BAY-12'
    }, customerToken);
    assert(custGenRes.status === 403, 'Customer forbidden from generating gate code (403)');

    // 7.3 Authorized facility operator generates gate entry code
    const genCodeRes = await api(`/bookings/${bookingId}/generate-code`, 'POST', {
      spot_label: 'BAY-12'
    }, approvedOwnerToken);
    assert(genCodeRes.status === 200, 'Operator successfully generates gate entry code');
    const capturedArrivalCode = genCodeRes.data.data.gate_code;
    assert(typeof capturedArrivalCode === 'string' && capturedArrivalCode.length === 6 && /^\d{6}$/.test(capturedArrivalCode),
      `Generated gate code is a 6-digit numeric string: "${capturedArrivalCode}"`);

    // 7.4 Customer detail view now reflects generated code and spot
    const detailRes = await api(`/bookings/${bookingId}`, 'GET', null, customerToken);
    assert(detailRes.status === 200 && detailRes.data.data.arrival_code === capturedArrivalCode,
      'Customer receives generated gate code in booking details');
    assert(detailRes.data.data.assigned_spot === 'BAY-12', 'Assigned spot reflects operator allocation');

    // 7.5 Wrong code entered by customer fails and increments failed_attempts
    const wrongCodeRes = await api(`/bookings/${bookingId}/verify`, 'POST', {
      code: '999999'
    }, customerToken);
    assert(wrongCodeRes.status === 400, 'Customer entering incorrect gate entry code is rejected');

    const dbCheckAttempts = await dbClient.query('SELECT failed_attempts FROM bookings WHERE id = $1', [bookingId]);
    assert(dbCheckAttempts.rows[0].failed_attempts === 1, 'Failed attempt incremented in database (1/5)');

    // 7.6 Operator cannot verify customer code (customer-only endpoint)
    const operatorVerifyRes = await api(`/bookings/${bookingId}/verify`, 'POST', {
      code: capturedArrivalCode
    }, approvedOwnerToken);
    assert(operatorVerifyRes.status === 403, 'Operator forbidden from entering driver code directly (403)');

    // 7.7 Correct code entered by customer activates booking and parking session
    const verifySuccessRes = await api(`/bookings/${bookingId}/verify`, 'POST', {
      code: capturedArrivalCode
    }, customerToken);
    assert(verifySuccessRes.status === 200, 'Customer successfully enters valid gate code; session activates');

    // 7.8 Single-use: Re-entry of the same code fails
    const reuseRes = await api(`/bookings/${bookingId}/verify`, 'POST', {
      code: capturedArrivalCode
    }, customerToken);
    assert(reuseRes.status === 400, 'Re-verification of already active booking fails (single-use enforced)');

    // ------------------------------------------------------------------------
    // TEST 8: Expiry Automation & Capacity Release
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 8: Expiry Automation & Capacity Release ---');

    // Create a pending booking on Location 1
    const expiryTestBooking = await api('/bookings', 'POST', {
      location_id: 1,
      pool: 'public',
      vehicle_type: 'four_wheeler',
      vehicle_number: 'TN23-EXP-01',
      rate_type: 'hour',
      quantity: 1
    }, customerToken);
    assert(expiryTestBooking.status === 201, 'Created pending booking for expiry test');
    const expBookingId = expiryTestBooking.data.data.id;

    // Backdate arrival_deadline directly in SQL to simulate time passing
    await dbClient.query(
      "UPDATE bookings SET arrival_deadline = NOW() - INTERVAL '1 minute' WHERE id = $1",
      [expBookingId]
    );

    // Call expire sweep
    const sweepRes = await dbClient.query('SELECT expire_overdue_bookings()');
    assert(sweepRes.rows[0].expire_overdue_bookings >= 1, 'expire_overdue_bookings() detected overdue booking');

    // Verify booking is now expired and secrets cleared
    const expRow = await dbClient.query('SELECT status, code_hash, code_encrypted FROM bookings WHERE id = $1', [expBookingId]);
    assert(expRow.rows[0].status === 'expired', 'Booking status transitioned to expired');
    assert(expRow.rows[0].code_hash === null && expRow.rows[0].code_encrypted === null, 'Secrets cleared upon expiry');

    // ------------------------------------------------------------------------
    // TEST 9: Exit Billing (₹60/hr + 15 min Overtime = ₹75)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 9: Exit Billing, Overtime Calculation & Tariff Immunity ---');

    // For booking `bookingId`: rate is ₹60/hr, scheduled duration is 1 hour.
    // Simulate 1 hour booking with 15 minutes overtime by shifting start_time 75 min ago and end_time 15 min ago
    await dbClient.query(
      "UPDATE bookings SET start_time = NOW() - INTERVAL '75 minutes', end_time = NOW() - INTERVAL '15 minutes' WHERE id = $1",
      [bookingId]
    );
    await dbClient.query(
      "UPDATE parking_sessions SET entry_time = NOW() - INTERVAL '75 minutes' WHERE booking_id = $1",
      [bookingId]
    );

    // Record exit
    const exitRes = await api(`/bookings/${bookingId}/exit`, 'POST', {}, approvedOwnerToken);
    assert(exitRes.status === 200, 'Operator recorded exit and generated bill');

    const invoice = exitRes.data.data.invoice;
    assert(invoice.overtime_minutes >= 15, `Calculated overtime minutes: ${invoice.overtime_minutes}`);
    assert(Number(invoice.overtime_amount) >= 15.00, `Calculated overtime amount: ₹${invoice.overtime_amount}`);
    assert(Number(invoice.total_amount) >= 75.00, `Total bill reflects ₹60 base + ₹15 overtime = ₹${invoice.total_amount}`);

    // Tariff Immunity test: Change the owner's tariff now and verify existing invoice is untouched
    await api(`/locations/${testLocationId}/tariff`, 'PUT', {
      hourly_rate: 150.00,
      overtime_rate_per_minute: 5.00
    }, approvedOwnerToken);

    const invCheck = await dbClient.query('SELECT total_amount, base_amount FROM invoices WHERE id = $1', [invoice.id]);
    assert(Number(invCheck.rows[0].total_amount) === Number(invoice.total_amount),
      'Later tariff change did NOT alter existing historical invoice');

    // ------------------------------------------------------------------------
    // TEST 10: Simulated Payments (Failed then Paid)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 10: Simulated Payments (Failed then Paid) ---');

    const paymentId = exitRes.data.data.payment.id;

    // 10.1 Simulate failed payment
    const payFail = await api(`/payments/${paymentId}/simulate`, 'POST', {
      outcome: 'failed'
    }, customerToken);
    assert(payFail.status === 200 && payFail.data.data.status === 'failed', 'Payment simulation marks status as failed');

    // 10.2 Retry and simulate successful payment
    const paySuccess = await api(`/payments/${paymentId}/simulate`, 'POST', {
      outcome: 'success',
      method: 'simulated_upi'
    }, customerToken);
    assert(paySuccess.status === 200 && paySuccess.data.data.status === 'paid', 'Payment simulation marks status as paid');

    // Verify invoice and booking total amounts remained unchanged
    const invAfterPay = await dbClient.query('SELECT total_amount FROM invoices WHERE id = $1', [invoice.id]);
    assert(Number(invAfterPay.rows[0].total_amount) === Number(invoice.total_amount),
      'Payment update left invoice amounts completely intact');

    // ------------------------------------------------------------------------
    // TEST 11: Cancellation Releases Capacity
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 11: Booking Cancellation & Capacity Release ---');

    const cancelTestBook = await api('/bookings', 'POST', {
      location_id: 1,
      pool: 'public',
      vehicle_type: 'four_wheeler',
      vehicle_number: 'TN23-CAN-01',
      rate_type: 'hour',
      quantity: 1
    }, customerToken);
    const cancelBookingId = cancelTestBook.data.data.id;

    // Check capacity occupancy before cancel
    const occBefore = await dbClient.query(
      "SELECT COUNT(*) FROM v_occupying_bookings WHERE booking_id = $1",
      [cancelBookingId]
    );
    assert(parseInt(occBefore.rows[0].count) === 1, 'Booking counts as occupying before cancellation');

    // Cancel booking
    const cancelRes = await api(`/bookings/${cancelBookingId}/cancel`, 'POST', {}, customerToken);
    assert(cancelRes.status === 200, 'Customer cancelled pending booking');

    // Check capacity occupancy after cancel
    const occAfter = await dbClient.query(
      "SELECT COUNT(*) FROM v_occupying_bookings WHERE booking_id = $1",
      [cancelBookingId]
    );
    assert(parseInt(occAfter.rows[0].count) === 0, 'Cancelled booking is excluded from occupying bookings view (capacity released)');

    // ------------------------------------------------------------------------
    // TEST 12: Configurable Parking Location Operating Hours (Daytime & Overnight)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 12: Configurable Operating Hours (Daytime & Overnight) ---');

    // 12.1 Validation: Non-24/7 without opening/closing time must be rejected (400)
    const invalidNoTimes = await api('/locations', 'POST', {
      name: 'Operating Hours Invalid No Times',
      address: '111 Time Street',
      locality: 'Katpadi',
      public_capacity: 5,
      hourly_rate: 40,
      is_24_7: false
    }, approvedOwnerToken);
    assert(invalidNoTimes.status === 400, 'Non-24/7 location without opening/closing times is rejected with 400');

    // 12.2 Validation: Non-24/7 with identical opening and closing times must be rejected (400)
    const invalidSameTimes = await api('/locations', 'POST', {
      name: 'Operating Hours Invalid Same Times',
      address: '112 Time Street',
      locality: 'Katpadi',
      public_capacity: 5,
      hourly_rate: 40,
      is_24_7: false,
      opens_at: '09:00',
      closes_at: '09:00'
    }, approvedOwnerToken);
    assert(invalidSameTimes.status === 400, 'Identical opening and closing times are rejected with 400');

    // 12.3 Create daytime location: 06:00 to 22:00
    const daytimeCreate = await api('/locations', 'POST', {
      name: 'Operating Hours Daytime Campus Lot',
      address: '113 Daytime Way',
      locality: 'Katpadi',
      public_capacity: 10,
      hourly_rate: 35,
      is_24_7: false,
      opens_at: '06:00',
      closes_at: '22:00',
      vehicle_types: ['four_wheeler']
    }, approvedOwnerToken);
    assert(daytimeCreate.status === 201, 'Daytime location (06:00 - 22:00) created successfully');
    const daytimeLoc = daytimeCreate.data.data;
    assert(daytimeLoc.is_24_7 === false && daytimeLoc.operating_hours.includes('06:00 AM - 10:00 PM'),
      'Daytime location has formatted operating hours (06:00 AM - 10:00 PM)');

    // 12.4 Create overnight location: 18:00 to 02:00 next day
    const overnightCreate = await api('/locations', 'POST', {
      name: 'Operating Hours Overnight Lot',
      address: '114 Night Owl Ave',
      locality: 'Katpadi',
      public_capacity: 10,
      hourly_rate: 50,
      is_24_7: false,
      opens_at: '18:00',
      closes_at: '02:00',
      vehicle_types: ['four_wheeler']
    }, approvedOwnerToken);
    assert(overnightCreate.status === 201, 'Overnight location (18:00 - 02:00) created successfully');
    const overnightLoc = overnightCreate.data.data;
    assert(overnightLoc.is_24_7 === false && overnightLoc.operating_hours.includes('06:00 PM - 02:00 AM (Overnight)'),
      'Overnight location has formatted operating hours with Overnight marker');

    // 12.5 Update location to 24/7 round the clock (clears times) and back
    const updateTo247 = await api(`/locations/${daytimeLoc.id}`, 'PUT', {
      name: 'Operating Hours Daytime Campus Lot',
      address: '113 Daytime Way',
      locality: 'Katpadi',
      public_capacity: 10,
      is_24_7: true
    }, approvedOwnerToken);
    assert(updateTo247.status === 200, 'Provider updated location to 24/7 round the clock');
    assert(updateTo247.data.data.is_24_7 === true && updateTo247.data.data.operating_hours === '24/7',
      '24/7 update cleared times and set operating_hours to 24/7');

    // Revert daytime location back to non-24/7
    await api(`/locations/${daytimeLoc.id}`, 'PUT', {
      name: 'Operating Hours Daytime Campus Lot',
      address: '113 Daytime Way',
      locality: 'Katpadi',
      public_capacity: 10,
      is_24_7: false,
      opens_at: '06:00',
      closes_at: '22:00'
    }, approvedOwnerToken);

    // Helpers to create ISO time strings for tomorrow
    const tomorrowAt = (h, m = 0) => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(h, m, 0, 0);
      return d.toISOString();
    };

    // 12.6 Daytime location booking within operating hours (10:00 AM to 12:00 PM) succeeds
    const validDaytimeBooking = await api('/bookings', 'POST', {
      location_id: daytimeLoc.id,
      pool: 'public',
      vehicle_type: 'four_wheeler',
      vehicle_number: 'TN23-OPHR-01',
      start_time: tomorrowAt(10, 0),
      rate_type: 'hour',
      quantity: 2
    }, customerToken);
    assert(validDaytimeBooking.status === 201, 'Booking within daytime operating hours succeeds');

    // 12.7 Daytime location booking outside operating hours (11:00 PM to 01:00 AM) rejected (400)
    const invalidDaytimeBooking = await api('/bookings', 'POST', {
      location_id: daytimeLoc.id,
      pool: 'public',
      vehicle_type: 'four_wheeler',
      vehicle_number: 'TN23-OPHR-02',
      start_time: tomorrowAt(23, 0),
      rate_type: 'hour',
      quantity: 2
    }, customerToken);
    assert(invalidDaytimeBooking.status === 400, 'Booking outside daytime operating hours is rejected with 400');

    // 12.8 Daytime estimation outside operating hours rejected (400)
    const invalidDaytimeEstimate = await api('/bookings/estimate', 'POST', {
      location_id: daytimeLoc.id,
      pool: 'public',
      start_time: tomorrowAt(23, 0),
      rate_type: 'hour',
      quantity: 2
    }, customerToken);
    assert(invalidDaytimeEstimate.status === 400, 'Booking estimation outside operating hours is rejected with 400');

    // 12.9 Overnight booking spanning midnight (starts 23:00, ends 01:00 next day) succeeds
    const validOvernightBooking = await api('/bookings', 'POST', {
      location_id: overnightLoc.id,
      pool: 'public',
      vehicle_type: 'four_wheeler',
      vehicle_number: 'TN23-OPHR-03',
      start_time: tomorrowAt(23, 0),
      rate_type: 'hour',
      quantity: 2
    }, customerToken);
    assert(validOvernightBooking.status === 201, 'Overnight booking spanning midnight within operating hours succeeds');

    // 12.10 Overnight booking exceeding closing time (starts 23:00, ends 04:00, facility closes at 02:00) rejected (400)
    const invalidOvernightBookingPastClose = await api('/bookings', 'POST', {
      location_id: overnightLoc.id,
      pool: 'public',
      vehicle_type: 'four_wheeler',
      vehicle_number: 'TN23-OPHR-04',
      start_time: tomorrowAt(23, 0),
      rate_type: 'hour',
      quantity: 5
    }, customerToken);
    assert(invalidOvernightBookingPastClose.status === 400, 'Overnight booking extending past facility closing time is rejected with 400');

    // 12.11 Overnight booking during daytime closed hours (12:00 PM to 02:00 PM) rejected (400)
    const invalidOvernightDaytimeArrival = await api('/bookings', 'POST', {
      location_id: overnightLoc.id,
      pool: 'public',
      vehicle_type: 'four_wheeler',
      vehicle_number: 'TN23-OPHR-05',
      start_time: tomorrowAt(12, 0),
      rate_type: 'hour',
      quantity: 2
    }, customerToken);
    assert(invalidOvernightDaytimeArrival.status === 400, 'Overnight facility booking during daytime closure is rejected with 400');

    // 12.12 Detail endpoint enriches aliases and live status
    const opDetailRes = await api(`/locations/${daytimeLoc.id}`, 'GET');
    assert(opDetailRes.status === 200, 'Location detail returns successfully');
    assert(typeof opDetailRes.data.data.is_currently_open === 'boolean', 'Location detail returns is_currently_open boolean');
    assert(opDetailRes.data.data.is_24_hours === false, 'Location detail returns is_24_hours alias');
    assert(Boolean(opDetailRes.data.data.opening_time) && Boolean(opDetailRes.data.data.closing_time),
      'Location detail returns opening_time and closing_time aliases');

    // ------------------------------------------------------------------------
    // TEST 13: Role-Based Access Control — Organization Admin Excluded from Customer Search & Booking
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 13: RBAC — Organization Admin Excluded from Customer Search & Booking ---');

    // 13.1 Customer can access public search (200)
    const custSearch = await api('/locations?locality=Katpadi', 'GET', null, customerToken);
    assert(custSearch.status === 200, 'Customer successfully accesses Find Parking search endpoint');

    // 13.2 Unauthenticated guest can access public search (200)
    const guestSearch = await api('/locations?locality=Katpadi', 'GET');
    assert(guestSearch.status === 200, 'Unauthenticated guest successfully accesses Find Parking search endpoint');

    // 13.3 Org Admin is blocked from public search endpoint (403)
    const orgAdminSearch = await api('/locations?locality=Katpadi', 'GET', null, demoOrgToken);
    assert(orgAdminSearch.status === 403, 'Org Admin blocked from public search endpoint with 403');

    // 13.4 Org Admin is blocked from customer booking estimation (403)
    const orgAdminEstimate = await api('/bookings/estimate', 'POST', {
      location_id: 1,
      pool: 'public',
      rate_type: 'hour',
      quantity: 1
    }, demoOrgToken);
    assert(orgAdminEstimate.status === 403, 'Org Admin blocked from customer booking estimation with 403');

    // 13.5 Org Admin is blocked from customer booking creation (403)
    const orgAdminBook = await api('/bookings', 'POST', {
      location_id: 1,
      pool: 'public',
      vehicle_type: 'four_wheeler',
      vehicle_number: 'TN23-ORG-01',
      rate_type: 'hour',
      quantity: 1
    }, demoOrgToken);
    assert(orgAdminBook.status === 403, 'Org Admin blocked from customer booking creation with 403');

    // 13.6 Org Admin retains access to all administrative endpoints (200)
    const orgProfile = await api('/org/profile', 'GET', null, demoOrgToken);
    assert(orgProfile.status === 200, 'Org Admin accesses organization profile');

    const orgLocations = await api('/locations/mine', 'GET', null, demoOrgToken);
    assert(orgLocations.status === 200, 'Org Admin accesses administrative locations');

    const orgPending = await api('/bookings/operator/pending', 'GET', null, demoOrgToken);
    assert(orgPending.status === 200, 'Org Admin accesses gate terminal arrivals');

    const orgMembers = await api('/org/members', 'GET', null, demoOrgToken);
    assert(orgMembers.status === 200, 'Org Admin accesses member directory');

    console.log('\n===========================================================');
    console.log(`   ALL ${passedTests}/${totalTests} SMOKE TEST SCENARIOS PASSED WITH 100% SUCCESS!`);
    console.log('===========================================================\n');
  } catch (err) {
    console.error('\n❌ Smoke Test Suite Terminated with Error:\n', err);
    process.exitCode = 1;
  } finally {
    await dbClient.end();
  }
}

runSmokeTests();
