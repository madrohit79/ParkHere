const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db/pool');

/**
 * Authentication Middleware: Validates Bearer JWT and confirms user is active in the database.
 */
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication token required' });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);

    // Verify user in the DB on every authenticated request
    const userRes = await query(
      'SELECT id, email, full_name, phone, role, is_active FROM users WHERE id = $1',
      [decoded.id]
    );

    if (userRes.rowCount === 0) {
      return res.status(401).json({ success: false, error: 'User does not exist' });
    }

    const user = userRes.rows[0];
    if (!user.is_active) {
      return res.status(401).json({ success: false, error: 'User account is deactivated' });
    }

    // Attach provider profile metadata if applicable
    if (user.role === 'org_admin') {
      const orgRes = await query(
        'SELECT id, name, org_identifier, approval_status, rejection_reason, is_active FROM organisations WHERE admin_user_id = $1',
        [user.id]
      );
      user.org = orgRes.rows[0] || null;
    } else if (user.role === 'owner') {
      const ownerRes = await query(
        'SELECT id, business_name, approval_status, rejection_reason FROM owner_profiles WHERE user_id = $1',
        [user.id]
      );
      user.ownerProfile = ownerRes.rows[0] || null;
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

/**
 * Optional Authentication Middleware: If token exists, sets req.user; otherwise proceeds with req.user = null.
 */
async function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const userRes = await query(
      'SELECT id, email, full_name, phone, role, is_active FROM users WHERE id = $1',
      [decoded.id]
    );

    if (userRes.rowCount > 0 && userRes.rows[0].is_active) {
      const user = userRes.rows[0];
      if (user.role === 'org_admin') {
        const orgRes = await query(
          'SELECT id, name, org_identifier, approval_status, rejection_reason, is_active FROM organisations WHERE admin_user_id = $1',
          [user.id]
        );
        user.org = orgRes.rows[0] || null;
      } else if (user.role === 'owner') {
        const ownerRes = await query(
          'SELECT id, business_name, approval_status, rejection_reason FROM owner_profiles WHERE user_id = $1',
          [user.id]
        );
        user.ownerProfile = ownerRes.rows[0] || null;
      }
      req.user = user;
    } else {
      req.user = null;
    }
  } catch (err) {
    req.user = null;
  }
  next();
}

module.exports = {
  authenticateToken,
  optionalAuth
};
