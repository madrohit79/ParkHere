const { query } = require('../db/pool');

/**
 * Returns owner profile details and business metrics.
 */
async function getOwnerProfile(req, res, next) {
  try {
    const ownerId = req.user.id;

    const profileRes = await query(
      `SELECT op.*, u.full_name, u.email, u.phone
       FROM owner_profiles op
       JOIN users u ON op.user_id = u.id
       WHERE op.user_id = $1`,
      [ownerId]
    );

    const metricsRes = await query(
      `SELECT 
         COUNT(DISTINCT l.id) AS location_count,
         COALESCE(SUM(l.public_capacity), 0) AS total_capacity,
         COUNT(b.id) AS total_bookings,
         COUNT(b.id) FILTER (WHERE b.status = 'active') AS active_sessions,
         COUNT(b.id) FILTER (WHERE b.status = 'completed') AS completed_sessions,
         COALESCE(SUM(inv.total_amount), 0.00) AS total_revenue
       FROM parking_locations l
       LEFT JOIN bookings b ON l.id = b.location_id
       LEFT JOIN invoices inv ON b.id = inv.booking_id
       WHERE l.owner_id = $1`,
      [ownerId]
    );

    res.json({
      success: true,
      data: {
        profile: profileRes.rows[0] || null,
        metrics: metricsRes.rows[0]
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getOwnerProfile
};
