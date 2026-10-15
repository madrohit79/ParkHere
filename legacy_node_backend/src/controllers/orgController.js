const { query } = require('../db/pool');

/**
 * Returns the organisation profile and basic statistics.
 */
async function getOrgProfile(req, res, next) {
  try {
    const orgId = req.user.org.id;

    const orgRes = await query(
      `SELECT o.*, u.full_name AS admin_name, u.email AS admin_email
       FROM organisations o
       JOIN users u ON o.admin_user_id = u.id
       WHERE o.id = $1`,
      [orgId]
    );

    // Location count and capacity
    const locRes = await query(
      `SELECT 
         COUNT(*) AS location_count,
         COALESCE(SUM(public_capacity), 0) AS total_public_capacity,
         COALESCE(SUM(member_capacity), 0) AS total_member_capacity
       FROM parking_locations
       WHERE org_id = $1`,
      [orgId]
    );

    // Member count
    const memberRes = await query(
      `SELECT 
         COUNT(*) AS total_members,
         COUNT(*) FILTER (WHERE is_active = TRUE) AS active_members,
         COUNT(*) FILTER (WHERE parking_benefit = 'free') AS free_members,
         COUNT(*) FILTER (WHERE parking_benefit = 'discounted') AS discounted_members
       FROM org_members
       WHERE org_id = $1`,
      [orgId]
    );

    // Booking counts
    const bookingRes = await query(
      `SELECT 
         COUNT(*) AS total_bookings,
         COUNT(*) FILTER (WHERE b.status = 'pending') AS pending_bookings,
         COUNT(*) FILTER (WHERE b.status = 'active') AS active_sessions,
         COUNT(*) FILTER (WHERE b.status = 'completed') AS completed_sessions
       FROM bookings b
       JOIN parking_locations l ON b.location_id = l.id
       WHERE l.org_id = $1`,
      [orgId]
    );

    res.json({
      success: true,
      data: {
        profile: orgRes.rows[0],
        locations: locRes.rows[0],
        members: memberRes.rows[0],
        bookings: bookingRes.rows[0]
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Lists member records for the organisation.
 */
async function getMembers(req, res, next) {
  try {
    const orgId = req.user.org.id;
    const result = await query(
      `SELECT 
         om.*,
         cm.customer_id,
         cm.verified_at,
         u.email AS linked_customer_email
       FROM org_members om
       LEFT JOIN customer_memberships cm ON om.id = cm.org_member_id AND cm.status = 'verified'
       LEFT JOIN users u ON cm.customer_id = u.id
       WHERE om.org_id = $1
       ORDER BY om.created_at DESC`,
      [orgId]
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
 * Adds a new member record to the organisation.
 */
async function addMember(req, res, next) {
  try {
    const orgId = req.user.org.id;
    const { member_identifier, full_name, email, phone, parking_benefit = 'standard' } = req.body;

    if (!member_identifier || !full_name || !email) {
      return res.status(400).json({ success: false, error: 'Member identifier, full name, and email are required' });
    }

    if (!['free', 'discounted', 'standard'].includes(parking_benefit)) {
      return res.status(400).json({ success: false, error: 'Parking benefit must be free, discounted, or standard' });
    }

    const dupCheck = await query(
      'SELECT id FROM org_members WHERE org_id = $1 AND UPPER(member_identifier) = UPPER($2)',
      [orgId, member_identifier.trim()]
    );

    if (dupCheck.rowCount > 0) {
      return res.status(409).json({ success: false, error: 'A member with this identifier already exists in your organisation' });
    }

    const insertRes = await query(
      `INSERT INTO org_members (org_id, member_identifier, full_name, email, phone, parking_benefit, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       RETURNING *`,
      [orgId, member_identifier.trim().toUpperCase(), full_name.trim(), email.trim().toLowerCase(), phone ? phone.trim() : null, parking_benefit]
    );

    res.status(201).json({
      success: true,
      message: 'Member record added successfully',
      data: insertRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Updates an existing member record.
 */
async function updateMember(req, res, next) {
  try {
    const orgId = req.user.org.id;
    const memberId = Number(req.params.id);
    const { full_name, email, phone, parking_benefit } = req.body;

    const checkRes = await query('SELECT id FROM org_members WHERE id = $1 AND org_id = $2', [memberId, orgId]);
    if (checkRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Member record not found' });
    }

    const updateRes = await query(
      `UPDATE org_members
       SET full_name = COALESCE($1, full_name),
           email = COALESCE($2, email),
           phone = COALESCE($3, phone),
           parking_benefit = COALESCE($4, parking_benefit),
           updated_at = NOW()
       WHERE id = $5 AND org_id = $6
       RETURNING *`,
      [full_name ? full_name.trim() : undefined, email ? email.trim().toLowerCase() : undefined, phone ? phone.trim() : undefined, parking_benefit, memberId, orgId]
    );

    res.json({
      success: true,
      message: 'Member record updated successfully',
      data: updateRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Toggles member active status (deactivates / reactivates).
 */
async function toggleMemberActive(req, res, next) {
  try {
    const orgId = req.user.org.id;
    const memberId = Number(req.params.id);

    const checkRes = await query('SELECT is_active FROM org_members WHERE id = $1 AND org_id = $2', [memberId, orgId]);
    if (checkRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Member record not found' });
    }

    const newActive = !checkRes.rows[0].is_active;

    const updateRes = await query(
      'UPDATE org_members SET is_active = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3 RETURNING *',
      [newActive, memberId, orgId]
    );

    res.json({
      success: true,
      message: `Member record ${newActive ? 'reactivated' : 'deactivated'} successfully`,
      data: updateRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getOrgProfile,
  getMembers,
  addMember,
  updateMember,
  toggleMemberActive
};
