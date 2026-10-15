const { query } = require('../db/pool');

/**
 * Returns platform system stats and metrics.
 */
async function getAdminStats(req, res, next) {
  try {
    const usersCount = await query(
      `SELECT 
         COUNT(*) AS total_users,
         COUNT(*) FILTER (WHERE role = 'customer') AS customers_count,
         COUNT(*) FILTER (WHERE role = 'owner') AS owners_count,
         COUNT(*) FILTER (WHERE role = 'org_admin') AS org_admins_count,
         COUNT(*) FILTER (WHERE is_active = FALSE) AS deactivated_users_count
       FROM users`
    );

    const providersCount = await query(
      `SELECT 
         (SELECT COUNT(*) FROM organisations WHERE approval_status = 'pending') AS pending_orgs,
         (SELECT COUNT(*) FROM owner_profiles WHERE approval_status = 'pending') AS pending_owners,
         (SELECT COUNT(*) FROM organisations WHERE approval_status = 'approved') AS approved_orgs,
         (SELECT COUNT(*) FROM owner_profiles WHERE approval_status = 'approved') AS approved_owners`
    );

    const listingsCount = await query(
      `SELECT 
         COUNT(*) AS total_locations,
         COUNT(*) FILTER (WHERE is_active = TRUE) AS active_locations,
         COUNT(*) FILTER (WHERE is_demo = TRUE) AS demo_locations
       FROM parking_locations`
    );

    const bookingsCount = await query(
      `SELECT 
         COUNT(*) AS total_bookings,
         COUNT(*) FILTER (WHERE status = 'pending') AS pending_bookings,
         COUNT(*) FILTER (WHERE status = 'active') AS active_sessions,
         COUNT(*) FILTER (WHERE status = 'completed') AS completed_bookings,
         COUNT(*) FILTER (WHERE status = 'expired') AS expired_bookings,
         COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_bookings
       FROM bookings`
    );

    const revenueCount = await query(
      'SELECT COALESCE(SUM(total_amount), 0.00) AS gross_revenue FROM invoices'
    );

    res.json({
      success: true,
      data: {
        users: usersCount.rows[0],
        providers: providersCount.rows[0],
        locations: listingsCount.rows[0],
        bookings: bookingsCount.rows[0],
        revenue: revenueCount.rows[0]
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Lists pending organisations and owners awaiting approval.
 */
async function getPendingProviders(req, res, next) {
  try {
    const orgsRes = await query(
      `SELECT o.*, u.full_name AS admin_name, u.email AS admin_email, u.phone AS admin_phone
       FROM organisations o
       JOIN users u ON o.admin_user_id = u.id
       ORDER BY o.created_at ASC`
    );

    const ownersRes = await query(
      `SELECT op.*, u.full_name, u.email, u.phone
       FROM owner_profiles op
       JOIN users u ON op.user_id = u.id
       ORDER BY op.created_at ASC`
    );

    res.json({
      success: true,
      data: {
        organisations: orgsRes.rows,
        owners: ownersRes.rows
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Approves an organisation.
 */
async function approveOrganisation(req, res, next) {
  try {
    const orgId = Number(req.params.id);
    const updateRes = await query(
      `UPDATE organisations
       SET approval_status = 'approved', rejection_reason = NULL, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [orgId]
    );

    if (updateRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Organisation not found' });
    }

    res.json({
      success: true,
      message: 'Organisation approved successfully',
      data: updateRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Rejects an organisation with a reason.
 */
async function rejectOrganisation(req, res, next) {
  try {
    const orgId = Number(req.params.id);
    const { reason = 'Application does not meet platform criteria' } = req.body;

    const updateRes = await query(
      `UPDATE organisations
       SET approval_status = 'rejected', rejection_reason = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [reason.trim(), orgId]
    );

    if (updateRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Organisation not found' });
    }

    res.json({
      success: true,
      message: 'Organisation rejected',
      data: updateRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Approves a parking owner.
 */
async function approveOwner(req, res, next) {
  try {
    const ownerProfileId = Number(req.params.id);
    const updateRes = await query(
      `UPDATE owner_profiles
       SET approval_status = 'approved', rejection_reason = NULL, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [ownerProfileId]
    );

    if (updateRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Owner profile not found' });
    }

    res.json({
      success: true,
      message: 'Owner approved successfully',
      data: updateRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Rejects a parking owner with a reason.
 */
async function rejectOwner(req, res, next) {
  try {
    const ownerProfileId = Number(req.params.id);
    const { reason = 'Owner application rejected' } = req.body;

    const updateRes = await query(
      `UPDATE owner_profiles
       SET approval_status = 'rejected', rejection_reason = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [reason.trim(), ownerProfileId]
    );

    if (updateRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Owner profile not found' });
    }

    res.json({
      success: true,
      message: 'Owner profile rejected',
      data: updateRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Lists all users with search and filtering.
 */
async function getUsers(req, res, next) {
  try {
    const result = await query(
      `SELECT id, email, full_name, phone, role, is_active, created_at
       FROM users
       ORDER BY created_at DESC`
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Toggles user active status (deactivates / reactivates).
 */
async function toggleUserActive(req, res, next) {
  try {
    const targetUserId = Number(req.params.id);

    if (targetUserId === req.user.id) {
      return res.status(400).json({ success: false, error: 'Administrator cannot deactivate own account' });
    }

    const checkRes = await query('SELECT is_active FROM users WHERE id = $1', [targetUserId]);
    if (checkRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const newActive = !checkRes.rows[0].is_active;

    const updateRes = await query(
      'UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, full_name, role, is_active',
      [newActive, targetUserId]
    );

    res.json({
      success: true,
      message: `User ${newActive ? 'reactivated' : 'deactivated'} successfully`,
      data: updateRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Lists all parking locations across the platform.
 */
async function getAllLocations(req, res, next) {
  try {
    const result = await query(
      `SELECT 
         l.*,
         t.hourly_rate,
         t.daily_rate,
         t.overtime_rate_per_minute,
         u.full_name AS owner_name,
         o.name AS org_name
       FROM parking_locations l
       LEFT JOIN location_tariffs t ON l.id = t.location_id
       LEFT JOIN users u ON l.owner_id = u.id
       LEFT JOIN organisations o ON l.org_id = o.id
       ORDER BY l.created_at DESC`
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Toggles location active status.
 */
async function toggleLocationActive(req, res, next) {
  try {
    const locationId = Number(req.params.id);

    const checkRes = await query('SELECT is_active FROM parking_locations WHERE id = $1', [locationId]);
    if (checkRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Location not found' });
    }

    const newActive = !checkRes.rows[0].is_active;

    const updateRes = await query(
      'UPDATE parking_locations SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [newActive, locationId]
    );

    res.json({
      success: true,
      message: `Location ${newActive ? 'activated' : 'deactivated'} successfully`,
      data: updateRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Read-only overview of platform bookings.
 */
async function getAllBookings(req, res, next) {
  try {
    const result = await query(
      `SELECT 
         b.id,
         b.booking_reference,
         b.pool,
         b.vehicle_type,
         b.vehicle_number,
         b.start_time,
         b.end_time,
         b.status,
         b.created_at,
         u.full_name AS customer_name,
         u.email AS customer_email,
         l.name AS location_name,
         inv.total_amount,
         pay.status AS payment_status
       FROM bookings b
       JOIN users u ON b.customer_id = u.id
       JOIN parking_locations l ON b.location_id = l.id
       LEFT JOIN invoices inv ON b.id = inv.booking_id
       LEFT JOIN payments pay ON inv.id = pay.invoice_id
       ORDER BY b.created_at DESC
       LIMIT 100`
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
  getAdminStats,
  getPendingProviders,
  approveOrganisation,
  rejectOrganisation,
  approveOwner,
  rejectOwner,
  getUsers,
  toggleUserActive,
  getAllLocations,
  toggleLocationActive,
  getAllBookings
};
