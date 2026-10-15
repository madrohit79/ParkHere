const crypto = require('crypto');
const { query } = require('../db/pool');
const { withTransaction } = require('../db/transaction');
const { generateArrivalCode, hashArrivalCode, encryptArrivalCode, decryptArrivalCode } = require('../utils/crypto');
const { calculateBaseAmount, calculateOvertime, calculateTotalBill } = require('../utils/billing');
const { calculateEndTime, calculateArrivalWindow, validateBookingOperatingHours, isLocationCurrentlyOpen } = require('../utils/time');

/**
 * Estimates pricing for a booking request without creating a record.
 */
async function estimateBooking(req, res, next) {
  try {
    // Role-based access control: Organization Admins must not request customer booking estimates
    if (req.user && req.user.role === 'org_admin') {
      return res.status(403).json({
        success: false,
        error: 'Organization administrators are not authorized to access customer booking estimation.'
      });
    }

    const { location_id, pool, rate_type, quantity, facility_codes } = req.body;

    if (!location_id || !rate_type || !quantity) {
      return res.status(400).json({ success: false, error: 'Location ID, rate type, and quantity are required' });
    }

    const locRes = await query(
      `SELECT l.*, t.hourly_rate, t.daily_rate, t.weekly_rate, t.monthly_rate, t.overtime_rate_per_minute, t.member_discount_percent
       FROM parking_locations l
       JOIN location_tariffs t ON l.id = t.location_id
       WHERE l.id = $1 AND l.is_active = TRUE`,
      [Number(location_id)]
    );

    if (locRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Location not found or inactive' });
    }

    const loc = locRes.rows[0];

    // Determine unit rate based on chosen rate_type
    const rateColumnMap = {
      hour: 'hourly_rate',
      day: 'daily_rate',
      week: 'weekly_rate',
      month: 'monthly_rate'
    };
    const rateField = rateColumnMap[rate_type];
    const unitPrice = rateField ? loc[rateField] : null;
    if (unitPrice === null || unitPrice === undefined) {
      return res.status(400).json({ success: false, error: `This location does not offer ${rate_type} pricing` });
    }

    // Validate operating hours if location is not 24/7
    if (!loc.is_24_7 && loc.opens_at && loc.closes_at) {
      const startTimeVal = req.body.start_time ? new Date(req.body.start_time) : new Date();
      const endTimeVal = calculateEndTime(startTimeVal, rate_type, Number(quantity));
      const opCheck = validateBookingOperatingHours(startTimeVal, endTimeVal, loc);
      if (!opCheck.valid) {
        return res.status(400).json({ success: false, error: opCheck.message });
      }
    }

    // Check membership benefit if member pool is requested
    let benefitApplied = 'none';
    let discountPercent = 0.00;

    if (pool === 'member') {
      if (!req.user || req.user.role !== 'customer') {
        return res.status(403).json({ success: false, error: 'Member pool requires customer sign-in' });
      }

      const memRes = await query(
        `SELECT om.parking_benefit
         FROM customer_memberships cm
         JOIN org_members om ON cm.org_member_id = om.id
         JOIN organisations o ON om.org_id = o.id
         WHERE cm.customer_id = $1 
           AND om.org_id = $2 
           AND cm.status = 'verified' 
           AND om.is_active = TRUE 
           AND o.is_active = TRUE 
           AND o.approval_status = 'approved'`,
        [req.user.id, loc.org_id]
      );

      if (memRes.rowCount === 0) {
        return res.status(403).json({ success: false, error: 'You are not a verified active member of this organisation' });
      }

      benefitApplied = memRes.rows[0].parking_benefit;
      if (benefitApplied === 'discounted') {
        discountPercent = Number(loc.member_discount_percent) || 0.00;
      }
    }

    const baseAmount = calculateBaseAmount(unitPrice, Number(quantity), benefitApplied, discountPercent);

    // Calculate addons
    let addonsAmount = 0.00;
    const selectedAddons = [];

    if (Array.isArray(facility_codes) && facility_codes.length > 0) {
      const facRes = await query(
        `SELECT lf.facility_code, lf.price, f.name
         FROM location_facilities lf
         JOIN facilities f ON lf.facility_code = f.code
         WHERE lf.location_id = $1 AND lf.facility_code = ANY($2::text[]) AND lf.is_offered = TRUE`,
        [Number(location_id), facility_codes]
      );

      for (const row of facRes.rows) {
        const p = Number(row.price);
        addonsAmount += p;
        selectedAddons.push({
          code: row.facility_code,
          name: row.name,
          price: p
        });
      }
    }

    const totalAmount = calculateTotalBill(baseAmount, 0, addonsAmount);

    res.json({
      success: true,
      data: {
        unit_price: Number(unitPrice),
        quantity: Number(quantity),
        rate_type,
        benefit_applied: benefitApplied,
        discount_percent: discountPercent,
        base_amount: baseAmount,
        addons_amount: addonsAmount,
        addons: selectedAddons,
        overtime_rate_per_minute: Number(loc.overtime_rate_per_minute),
        total_amount: totalAmount
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Creates a parking reservation in a single atomic transaction.
 * Strictly adheres to Section 6.2 with FOR UPDATE serialisation.
 */
async function createBooking(req, res, next) {
  try {
    const customerId = req.user.id;
    const {
      location_id,
      pool = 'public',
      vehicle_type,
      vehicle_number,
      start_time,
      rate_type,
      quantity = 1,
      facility_codes = []
    } = req.body;

    if (!location_id || !vehicle_type || !vehicle_number || !rate_type) {
      return res.status(400).json({ success: false, error: 'Location ID, vehicle type, vehicle number, and rate type are required' });
    }

    if (!['public', 'member'].includes(pool)) {
      return res.status(400).json({ success: false, error: 'Pool must be either public or member' });
    }

    const numQty = parseInt(quantity, 10);
    if (isNaN(numQty) || numQty < 1 || numQty > 100) {
      return res.status(400).json({ success: false, error: 'Quantity must be a positive integer' });
    }

    const now = new Date();
    // Default start_time to NOW() if not provided or requested as now
    const reqStart = start_time ? new Date(start_time) : now;

    // Start time must not be more than 10 minutes in the past
    if (reqStart.getTime() < now.getTime() - 10 * 60 * 1000) {
      return res.status(400).json({ success: false, error: 'Start time cannot be in the past' });
    }

    // Start time maximum 7 days in advance
    if (reqStart.getTime() > now.getTime() + 7 * 24 * 3600 * 1000) {
      return res.status(400).json({ success: false, error: 'Advance bookings are permitted up to 7 days ahead only' });
    }

    const reqEnd = calculateEndTime(reqStart, rate_type, numQty);

    const bookingResult = await withTransaction(async (client) => {
      // 1. Expire overdue bookings
      await client.query('SELECT expire_overdue_bookings()');

      // 2. Lock location row with FOR UPDATE to serialize concurrent bookings
      const locRes = await client.query(
        `SELECT l.*, t.hourly_rate, t.daily_rate, t.weekly_rate, t.monthly_rate, t.overtime_rate_per_minute, t.member_discount_percent
         FROM parking_locations l
         JOIN location_tariffs t ON l.id = t.location_id
         WHERE l.id = $1
         FOR UPDATE`,
        [Number(location_id)]
      );

      if (locRes.rowCount === 0) {
        throw { statusCode: 404, message: 'Parking location not found' };
      }

      const loc = locRes.rows[0];

      if (!loc.is_active) {
        throw { statusCode: 400, message: 'This parking location is currently inactive' };
      }

      // Check provider approval
      if (loc.provider_type === 'owner') {
        const opCheck = await client.query(
          'SELECT approval_status FROM owner_profiles WHERE user_id = $1',
          [loc.owner_id]
        );
        if (opCheck.rowCount === 0 || opCheck.rows[0].approval_status !== 'approved') {
          throw { statusCode: 403, message: 'Location provider is not currently approved' };
        }
      } else if (loc.provider_type === 'org') {
        const orgCheck = await client.query(
          'SELECT approval_status, is_active FROM organisations WHERE id = $1',
          [loc.org_id]
        );
        if (orgCheck.rowCount === 0 || orgCheck.rows[0].approval_status !== 'approved' || !orgCheck.rows[0].is_active) {
          throw { statusCode: 403, message: 'Organisation provider is not approved or is inactive' };
        }
      }

      // Validate vehicle type compatibility
      const vtCheck = await client.query(
        'SELECT 1 FROM location_vehicle_types WHERE location_id = $1 AND vehicle_type = $2',
        [loc.id, vehicle_type]
      );
      if (vtCheck.rowCount === 0) {
        throw { statusCode: 400, message: `Vehicle type '${vehicle_type}' is not supported at this location` };
      }

      // Validate operating hours if not 24/7
      if (!loc.is_24_7 && loc.opens_at && loc.closes_at) {
        const opCheck = validateBookingOperatingHours(reqStart, reqEnd, loc);
        if (!opCheck.valid) {
          throw { statusCode: 400, message: opCheck.message };
        }
      }

      // Validate rate type is offered
      const rateColumnMap = {
        hour: 'hourly_rate',
        day: 'daily_rate',
        week: 'weekly_rate',
        month: 'monthly_rate'
      };
      const rateField = rateColumnMap[rate_type];
      const unitRate = rateField ? loc[rateField] : null;
      if (unitRate === null || unitRate === undefined) {
        throw { statusCode: 400, message: `Rate type '${rate_type}' is not offered at this location` };
      }

      // Membership verification if pool is 'member'
      let benefitApplied = 'none';
      let discountPercent = 0.00;

      if (pool === 'member') {
        if (!loc.org_id) {
          throw { statusCode: 400, message: 'Private owner locations do not have a member pool' };
        }

        const memCheck = await client.query(
          `SELECT om.parking_benefit
           FROM customer_memberships cm
           JOIN org_members om ON cm.org_member_id = om.id
           JOIN organisations o ON om.org_id = o.id
           WHERE cm.customer_id = $1
             AND om.org_id = $2
             AND cm.status = 'verified'
             AND om.is_active = TRUE
             AND o.is_active = TRUE
             AND o.approval_status = 'approved'`,
          [customerId, loc.org_id]
        );

        if (memCheck.rowCount === 0) {
          throw { statusCode: 403, message: 'You must have an active verified membership with this organisation to book from the member pool' };
        }

        benefitApplied = memCheck.rows[0].parking_benefit;
        if (benefitApplied === 'discounted') {
          discountPercent = Number(loc.member_discount_percent) || 0.00;
        }
      }

      // Step 4: Overlap capacity check
      const capacity = pool === 'member' ? loc.member_capacity : loc.public_capacity;
      if (capacity <= 0) {
        throw { statusCode: 409, message: `No ${pool} capacity exists at this location` };
      }

      const overlapRes = await client.query(
        `SELECT COUNT(*) AS occ_count
         FROM v_occupying_bookings
         WHERE location_id = $1
           AND pool = $2
           AND occ_start < $3
           AND occ_end > $4`,
        [loc.id, pool, reqEnd, reqStart]
      );

      const currentlyOccupied = parseInt(overlapRes.rows[0].occ_count, 10);
      if (currentlyOccupied >= capacity) {
        throw {
          statusCode: 409,
          message: `Location is fully booked for the requested time interval in the ${pool} pool (${currentlyOccupied}/${capacity} occupied)`
        };
      }

      // Step 5: Snapshot requested facilities
      let addonsAmount = 0.00;
      const snapshottedAddons = [];

      if (Array.isArray(facility_codes) && facility_codes.length > 0) {
        const facRes = await client.query(
          `SELECT lf.facility_code, lf.price
           FROM location_facilities lf
           WHERE lf.location_id = $1 AND lf.facility_code = ANY($2::text[]) AND lf.is_offered = TRUE`,
          [loc.id, facility_codes]
        );

        for (const fRow of facRes.rows) {
          const price = Number(fRow.price);
          addonsAmount += price;
          snapshottedAddons.push({
            code: fRow.facility_code,
            price: price
          });
        }
      }

      // Step 6: Pricing calculations
      const baseAmount = calculateBaseAmount(unitRate, numQty, benefitApplied, discountPercent);
      const overtimeRate = Number(loc.overtime_rate_per_minute) || 1.00;

      // Step 7: Arrival window calculation (Gate entry code will be generated by the organization admin at terminal)
      const { windowStart, deadline } = calculateArrivalWindow(reqStart, now);
      const bookingRef = `PH-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

      // Insert booking without code (code_hash and code_encrypted remain NULL until operator issues it)
      const bookRes = await client.query(
        `INSERT INTO bookings (
          booking_reference, customer_id, location_id, pool,
          vehicle_type, vehicle_number, start_time, end_time, status,
          arrival_window_start, arrival_deadline, code_hash, code_encrypted,
          rate_type, quantity, unit_price_snapshot, benefit_applied,
          discount_percent_snapshot, base_amount_snapshot, overtime_rate_snapshot
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, 'pending',
          $9, $10, NULL, NULL,
          $11, $12, $13, $14,
          $15, $16, $17
        ) RETURNING *`,
        [
          bookingRef, customerId, loc.id, pool,
          vehicle_type, vehicle_number.trim().toUpperCase(), reqStart, reqEnd,
          windowStart, deadline,
          rate_type, numQty, Number(unitRate), benefitApplied,
          discountPercent, baseAmount, overtimeRate
        ]
      );
      const booking = bookRes.rows[0];

      // Insert addons
      for (const addon of snapshottedAddons) {
        await client.query(
          `INSERT INTO booking_addons (booking_id, facility_code, price_snapshot)
           VALUES ($1, $2, $3)`,
          [booking.id, addon.code, addon.price]
        );
      }

      return {
        booking,
        arrival_code: null,
        addons: snapshottedAddons,
        addons_amount: addonsAmount,
        total_estimate: calculateTotalBill(baseAmount, 0, addonsAmount)
      };
    });

    res.status(201).json({
      success: true,
      message: 'Booking created successfully. Please obtain your gate entry code from the gate operator upon arrival.',
      data: {
        ...bookingResult.booking,
        arrival_code: null,
        addons: bookingResult.addons,
        addons_amount: bookingResult.addons_amount,
        total_estimate: bookingResult.total_estimate,
        server_time: new Date()
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Returns customer bookings grouped by lifecycle state.
 */
async function getCustomerBookings(req, res, next) {
  try {
    await query('SELECT expire_overdue_bookings()');

    const customerId = req.user.id;
    const result = await query(
      `SELECT 
         b.id,
         b.booking_reference,
         b.location_id,
         b.pool,
         b.vehicle_type,
         b.vehicle_number,
         b.start_time,
         b.end_time,
         b.status,
         b.arrival_window_start,
         b.arrival_deadline,
         b.rate_type,
         b.quantity,
         b.unit_price_snapshot,
         b.benefit_applied,
         b.discount_percent_snapshot,
         b.base_amount_snapshot,
         b.overtime_rate_snapshot,
         b.created_at,
         l.name AS location_name,
         l.locality,
         l.address,
         inv.id AS invoice_id,
         inv.total_amount,
         pay.status AS payment_status,
         pay.id AS payment_id
       FROM bookings b
       JOIN parking_locations l ON b.location_id = l.id
       LEFT JOIN invoices inv ON b.id = inv.booking_id
       LEFT JOIN payments pay ON inv.id = pay.invoice_id
       WHERE b.customer_id = $1
       ORDER BY b.created_at DESC`,
      [customerId]
    );

    res.json({
      success: true,
      data: result.rows,
      server_time: new Date()
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves booking detail with decrypted code (if customer and pending) and audit timeline.
 */
async function getBookingDetail(req, res, next) {
  try {
    await query('SELECT expire_overdue_bookings()');

    const bookingId = Number(req.params.id);
    const userId = req.user.id;

    const bookRes = await query(
      `SELECT 
         b.*,
         l.name AS location_name,
         l.locality,
         l.address,
         l.owner_id,
         l.org_id,
         u.full_name AS customer_name,
         u.email AS customer_email,
         u.phone AS customer_phone
       FROM bookings b
       JOIN parking_locations l ON b.location_id = l.id
       JOIN users u ON b.customer_id = u.id
       WHERE b.id = $1`,
      [bookingId]
    );

    if (bookRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    const booking = bookRes.rows[0];

    // Authorization: customer owner, location operator, or platform admin
    const isCustomerOwner = booking.customer_id === userId;
    let isOperator = false;
    if (req.user.role === 'owner' && booking.owner_id === userId) {
      isOperator = true;
    } else if (req.user.role === 'org_admin' && req.user.org && booking.org_id === req.user.org.id) {
      isOperator = true;
    } else if (req.user.role === 'platform_admin') {
      isOperator = true;
    }

    if (!isCustomerOwner && !isOperator) {
      return res.status(403).json({ success: false, error: 'Forbidden: you cannot view this booking' });
    }

    // Decrypt code for customer owner while booking is pending and unexpired, if operator generated it
    const now = new Date();
    let displayCode = null;
    if (isCustomerOwner && booking.status === 'pending' && booking.code_encrypted) {
      if (new Date(booking.arrival_deadline) >= now) {
        try {
          displayCode = decryptArrivalCode(booking.code_encrypted);
        } catch (e) {
          displayCode = null;
        }
      }
    }

    // Addons
    const addonsRes = await query(
      `SELECT ba.facility_code, ba.price_snapshot, f.name
       FROM booking_addons ba
       JOIN facilities f ON ba.facility_code = f.code
       WHERE ba.booking_id = $1`,
      [bookingId]
    );

    // Session
    const sessionRes = await query(
      'SELECT * FROM parking_sessions WHERE booking_id = $1',
      [bookingId]
    );

    // Invoice & Payment
    const invRes = await query(
      `SELECT inv.*, pay.id AS payment_id, pay.status AS payment_status, pay.payment_method, pay.transaction_ref, pay.paid_at
       FROM invoices inv
       LEFT JOIN payments pay ON inv.id = pay.invoice_id
       WHERE inv.booking_id = $1`,
      [bookingId]
    );

    // Timeline events
    const eventsRes = await query(
      'SELECT * FROM booking_events WHERE booking_id = $1 ORDER BY created_at ASC',
      [bookingId]
    );

    // Remove raw encrypted secret from response
    delete booking.code_hash;
    delete booking.code_encrypted;

    res.json({
      success: true,
      data: {
        ...booking,
        arrival_code: displayCode,
        has_code_generated: Boolean(displayCode),
        assigned_spot: booking.assigned_spot || null,
        addons: addonsRes.rows,
        session: sessionRes.rows[0] || null,
        invoice: invRes.rows[0] || null,
        timeline: eventsRes.rows,
        server_time: new Date()
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Customer cancels a pending booking.
 */
async function cancelBooking(req, res, next) {
  try {
    const bookingId = Number(req.params.id);
    const customerId = req.user.id;

    const cancelRes = await query(
      `UPDATE bookings
       SET status = 'cancelled',
           code_hash = NULL,
           code_encrypted = NULL,
           updated_at = NOW()
       WHERE id = $1 AND customer_id = $2 AND status = 'pending'
       RETURNING id, booking_reference, status`,
      [bookingId, customerId]
    );

    if (cancelRes.rowCount === 0) {
      return res.status(400).json({
        success: false,
        error: 'Booking could not be cancelled. Only unexpired pending bookings can be cancelled by the customer.'
      });
    }

    res.json({
      success: true,
      message: 'Booking cancelled successfully and capacity released',
      data: cancelRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Organization Admin or Lot Owner generates/replaces a gate entry code for a pending booking.
 */
async function generateGateCode(req, res, next) {
  try {
    const bookingId = Number(req.params.id);
    const { spot_label } = req.body;
    const operatorId = req.user.id;

    const checkRes = await query(
      `SELECT b.*, l.owner_id, l.org_id, l.name AS location_name
       FROM bookings b
       JOIN parking_locations l ON b.location_id = l.id
       WHERE b.id = $1`,
      [bookingId]
    );

    if (checkRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    const booking = checkRes.rows[0];

    // Check operator facility ownership
    let isOwner = false;
    if (req.user.role === 'owner' && booking.owner_id === operatorId) {
      isOwner = true;
    } else if (req.user.role === 'org_admin' && req.user.org && booking.org_id === req.user.org.id) {
      isOwner = true;
    } else if (req.user.role === 'platform_admin') {
      isOwner = true;
    }

    if (!isOwner) {
      return res.status(403).json({ success: false, error: 'Forbidden: you can only generate gate codes for bookings at your facilities' });
    }

    if (booking.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Cannot generate gate code for booking with status '${booking.status}'`
      });
    }

    // Generate fresh 6-digit numeric code
    let plainCode = generateArrivalCode();
    let codeHash = hashArrivalCode(plainCode);
    let codeEnc = encryptArrivalCode(plainCode);

    // Ensure no pending collision at this location
    let attempts = 0;
    while (attempts < 5) {
      const colCheck = await query(
        "SELECT id FROM bookings WHERE location_id = $1 AND code_hash = $2 AND status = 'pending' AND id != $3",
        [booking.location_id, codeHash, bookingId]
      );
      if (colCheck.rowCount === 0) break;
      plainCode = generateArrivalCode();
      codeHash = hashArrivalCode(plainCode);
      codeEnc = encryptArrivalCode(plainCode);
      attempts++;
    }

    const now = new Date();
    const newDeadline = new Date(now.getTime() + 15 * 60 * 1000);
    const assignedSpot = spot_label ? spot_label.trim() : (booking.assigned_spot || 'Bay-General');

    const updateRes = await query(
      `UPDATE bookings
       SET code_hash = $1,
           code_encrypted = $2,
           arrival_window_start = NOW(),
           arrival_deadline = $3,
           failed_attempts = 0,
           assigned_spot = $4,
           updated_at = NOW()
       WHERE id = $5 AND status = 'pending'
       RETURNING id, booking_reference, status, arrival_window_start, arrival_deadline, assigned_spot`,
      [codeHash, codeEnc, newDeadline, assignedSpot, bookingId]
    );

    if (updateRes.rowCount === 0) {
      return res.status(400).json({ success: false, error: 'Failed to update booking with gate code' });
    }

    res.json({
      success: true,
      message: 'Gate entry code generated successfully',
      data: {
        booking_id: bookingId,
        booking_reference: updateRes.rows[0].booking_reference,
        gate_code: plainCode,
        arrival_deadline: newDeadline,
        assigned_spot: assignedSpot,
        server_time: now
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * User / Customer enters their gate entry code to verify and start their parking session.
 * Atomic single-use code verification inside arrival window.
 */
async function verifyArrivalCode(req, res, next) {
  try {
    const bookingId = Number(req.params.id);
    const { code } = req.body;
    const userId = req.user.id;

    if (!code || String(code).trim().length !== 6) {
      return res.status(400).json({ success: false, error: 'A valid 6-digit gate entry code is required' });
    }

    const hashedInput = hashArrivalCode(String(code).trim());

    const result = await withTransaction(async (client) => {
      // 1. Check booking exists and customer ownership
      const checkRes = await client.query(
        `SELECT b.*, l.name AS location_name
         FROM bookings b
         JOIN parking_locations l ON b.location_id = l.id
         WHERE b.id = $1`,
        [bookingId]
      );

      if (checkRes.rowCount === 0) {
        throw { statusCode: 404, message: 'Booking not found' };
      }

      const booking = checkRes.rows[0];

      // Customer authorization check (or platform admin)
      if (booking.customer_id !== userId && req.user.role !== 'platform_admin') {
        throw { statusCode: 403, message: 'Forbidden: you can only enter gate codes for your own booking' };
      }

      // Check status
      if (booking.status !== 'pending') {
        throw { statusCode: 400, message: `Booking cannot be verified because it is already '${booking.status}'` };
      }

      // Check if code was generated by admin yet
      if (!booking.code_hash) {
        throw { statusCode: 400, message: 'Gate entry code has not been generated by the organization admin yet. Please wait for the operator to issue your code.' };
      }

      // Check attempt limits
      if (booking.failed_attempts >= 5) {
        throw { statusCode: 400, message: 'Verification locked: maximum 5 failed attempts exceeded. Please ask the operator for a replacement code.' };
      }

      const now = new Date();
      if (now > new Date(booking.arrival_deadline)) {
        // Expire booking immediately
        await client.query(
          "UPDATE bookings SET status = 'expired', code_hash = NULL, code_encrypted = NULL, updated_at = NOW() WHERE id = $1",
          [bookingId]
        );
        throw { statusCode: 400, message: 'Gate entry code has expired. Please ask the gate operator to issue a replacement code.' };
      }

      // Atomic guarded update
      const updateRes = await client.query(
        `UPDATE bookings
         SET status = 'active',
             code_hash = NULL,
             code_encrypted = NULL,
             updated_at = NOW()
         WHERE id = $1 
           AND status = 'pending' 
           AND code_hash = $2
           AND NOW() <= arrival_deadline
           AND failed_attempts < 5
         RETURNING id, booking_reference, status, assigned_spot`,
        [bookingId, hashedInput]
      );

      if (updateRes.rowCount === 0) {
        // Increment failed attempts and commit
        await client.query(
          'UPDATE bookings SET failed_attempts = failed_attempts + 1, updated_at = NOW() WHERE id = $1',
          [bookingId]
        );
        const attemptsLeft = 5 - (booking.failed_attempts + 1);
        return { failed: true, message: `Invalid gate entry code. Please check the code provided by the operator. (${attemptsLeft} attempt(s) remaining)` };
      }

      // Insert parking session with spot allocated by admin
      const spotAssigned = updateRes.rows[0].assigned_spot || 'Bay-General';
      const sessionRes = await client.query(
        `INSERT INTO parking_sessions (booking_id, entry_time, verified_by_user_id, spot_label, notes)
         VALUES ($1, NOW(), $2, $3, 'Gate code verified by driver at terminal')
         RETURNING *`,
        [bookingId, booking.customer_id, spotAssigned]
      );

      return {
        booking: updateRes.rows[0],
        session: sessionRes.rows[0]
      };
    });

    if (result.failed) {
      return res.status(400).json({ success: false, error: result.message });
    }

    res.json({
      success: true,
      message: 'Gate entry code verified successfully. Entry barrier opened! Your parking session is now active.',
      data: result
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Operator records exit, calculates overtime & bill, and completes booking.
 */
async function recordExit(req, res, next) {
  try {
    const bookingId = Number(req.params.id);
    const operatorId = req.user.id;

    const result = await withTransaction(async (client) => {
      // 1. Lock booking and verify operator ownership
      const checkRes = await client.query(
        `SELECT b.*, l.owner_id, l.org_id, s.id AS session_id, s.entry_time, s.exit_time
         FROM bookings b
         JOIN parking_locations l ON b.location_id = l.id
         LEFT JOIN parking_sessions s ON b.id = s.booking_id
         WHERE b.id = $1
         FOR UPDATE OF b`,
        [bookingId]
      );

      if (checkRes.rowCount === 0) {
        throw { statusCode: 404, message: 'Booking not found' };
      }

      const booking = checkRes.rows[0];

      let isOwner = false;
      if (req.user.role === 'owner' && booking.owner_id === operatorId) {
        isOwner = true;
      } else if (req.user.role === 'org_admin' && req.user.org && booking.org_id === req.user.org.id) {
        isOwner = true;
      }

      if (!isOwner) {
        throw { statusCode: 403, message: 'Forbidden: you do not operate this facility' };
      }

      if (booking.status !== 'active') {
        throw { statusCode: 400, message: `Cannot record exit: booking is '${booking.status}', expected 'active'` };
      }

      if (!booking.session_id || booking.exit_time) {
        throw { statusCode: 400, message: 'Parking session has already been completed' };
      }

      const now = new Date();

      // 2. Calculate actual duration in minutes
      const entryTime = new Date(booking.entry_time);
      const actualDurationMinutes = Math.max(1, Math.ceil((now.getTime() - entryTime.getTime()) / (1000 * 60)));

      // 3. Calculate overtime based on scheduled end
      const { overtimeMinutes, overtimeAmount } = calculateOvertime(
        booking.end_time,
        now,
        booking.overtime_rate_snapshot
      );

      // 4. Calculate addons amount
      const addonsRes = await client.query(
        'SELECT COALESCE(SUM(price_snapshot), 0.00) AS total_addons FROM booking_addons WHERE booking_id = $1',
        [bookingId]
      );
      const addonsAmount = Number(addonsRes.rows[0].total_addons) || 0.00;

      // 5. Calculate total bill
      const baseAmount = Number(booking.base_amount_snapshot);
      const totalAmount = calculateTotalBill(baseAmount, overtimeAmount, addonsAmount);

      // 6. Update session
      await client.query(
        'UPDATE parking_sessions SET exit_time = $1 WHERE id = $2',
        [now, booking.session_id]
      );

      // 7. Insert Invoice
      const invRes = await client.query(
        `INSERT INTO invoices (
          booking_id, session_id, base_amount, overtime_minutes, overtime_amount,
          addons_amount, total_amount, actual_duration_minutes, generated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        RETURNING *`,
        [
          bookingId, booking.session_id, baseAmount, overtimeMinutes, overtimeAmount,
          addonsAmount, totalAmount, actualDurationMinutes
        ]
      );
      const invoice = invRes.rows[0];

      // 8. Insert Payment record (pending simulated payment)
      const payRes = await client.query(
        `INSERT INTO payments (invoice_id, booking_id, amount, status, payment_method)
         VALUES ($1, $2, $3, 'pending', 'simulated')
         RETURNING *`,
        [invoice.id, bookingId, totalAmount]
      );
      const payment = payRes.rows[0];

      // 9. Mark booking completed
      await client.query(
        "UPDATE bookings SET status = 'completed', updated_at = NOW() WHERE id = $1",
        [bookingId]
      );

      return {
        booking_id: bookingId,
        invoice,
        payment,
        actual_exit_time: now
      };
    });

    res.json({
      success: true,
      message: 'Vehicle exit recorded and invoice generated successfully',
      data: result
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Operator lists pending arrivals for their locations (arrival code is NOT displayed).
 */
async function getOperatorPending(req, res, next) {
  try {
    await query('SELECT expire_overdue_bookings()');

    let condition = '';
    const params = [];

    if (req.user.role === 'owner') {
      params.push(req.user.id);
      condition = 'l.owner_id = $1';
    } else if (req.user.role === 'org_admin') {
      params.push(req.user.org.id);
      condition = 'l.org_id = $1';
    } else {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const result = await query(
      `SELECT 
         b.id,
         b.booking_reference,
         b.location_id,
         b.pool,
         b.vehicle_type,
         b.vehicle_number,
         b.start_time,
         b.end_time,
         b.arrival_window_start,
         b.arrival_deadline,
         b.failed_attempts,
         b.code_encrypted,
         b.assigned_spot,
         u.full_name AS customer_name,
         u.phone AS customer_phone,
         l.name AS location_name
       FROM bookings b
       JOIN parking_locations l ON b.location_id = l.id
       JOIN users u ON b.customer_id = u.id
       WHERE ${condition}
         AND b.status = 'pending'
         AND b.arrival_deadline >= NOW()
       ORDER BY b.arrival_deadline ASC`,
      params
    );

    const rows = result.rows.map(row => {
      let plainCode = null;
      if (row.code_encrypted) {
        try {
          plainCode = decryptArrivalCode(row.code_encrypted);
        } catch (e) {
          plainCode = null;
        }
      }
      const clean = { ...row };
      delete clean.code_encrypted;
      return {
        ...clean,
        current_code: plainCode,
        has_code: Boolean(plainCode)
      };
    });

    res.json({
      success: true,
      data: rows,
      server_time: new Date()
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Operator lists currently active parking sessions.
 */
async function getOperatorActive(req, res, next) {
  try {
    let condition = '';
    const params = [];

    if (req.user.role === 'owner') {
      params.push(req.user.id);
      condition = 'l.owner_id = $1';
    } else if (req.user.role === 'org_admin') {
      params.push(req.user.org.id);
      condition = 'l.org_id = $1';
    } else {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const result = await query(
      `SELECT 
         b.id AS booking_id,
         b.booking_reference,
         b.location_id,
         b.pool,
         b.vehicle_type,
         b.vehicle_number,
         b.start_time,
         b.end_time,
         b.base_amount_snapshot,
         b.overtime_rate_snapshot,
         s.id AS session_id,
         s.entry_time,
         s.spot_label,
         u.full_name AS customer_name,
         u.phone AS customer_phone,
         l.name AS location_name
       FROM bookings b
       JOIN parking_sessions s ON b.id = s.booking_id
       JOIN parking_locations l ON b.location_id = l.id
       JOIN users u ON b.customer_id = u.id
       WHERE ${condition}
         AND b.status = 'active'
         AND s.exit_time IS NULL
       ORDER BY s.entry_time ASC`,
      params
    );

    res.json({
      success: true,
      data: result.rows,
      server_time: new Date()
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Operator lists completed sessions and invoices.
 */
async function getOperatorCompleted(req, res, next) {
  try {
    let condition = '';
    const params = [];

    if (req.user.role === 'owner') {
      params.push(req.user.id);
      condition = 'l.owner_id = $1';
    } else if (req.user.role === 'org_admin') {
      params.push(req.user.org.id);
      condition = 'l.org_id = $1';
    } else {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const result = await query(
      `SELECT 
         b.id AS booking_id,
         b.booking_reference,
         b.vehicle_number,
         b.vehicle_type,
         s.entry_time,
         s.exit_time,
         inv.id AS invoice_id,
         inv.base_amount,
         inv.overtime_minutes,
         inv.overtime_amount,
         inv.addons_amount,
         inv.total_amount,
         inv.actual_duration_minutes,
         pay.id AS payment_id,
         pay.status AS payment_status,
         u.full_name AS customer_name,
         l.name AS location_name
       FROM bookings b
       JOIN parking_locations l ON b.location_id = l.id
       JOIN parking_sessions s ON b.id = s.booking_id
       JOIN invoices inv ON b.id = inv.booking_id
       LEFT JOIN payments pay ON inv.id = pay.invoice_id
       JOIN users u ON b.customer_id = u.id
       WHERE ${condition}
         AND b.status = 'completed'
       ORDER BY inv.generated_at DESC`,
      params
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  estimateBooking,
  createBooking,
  getCustomerBookings,
  getBookingDetail,
  cancelBooking,
  generateGateCode,
  verifyArrivalCode,
  recordExit,
  getOperatorPending,
  getOperatorActive,
  getOperatorCompleted
};
