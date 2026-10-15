const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db/pool');
const { withTransaction } = require('../db/transaction');

async function register(req, res, next) {
  try {
    const { email, password, full_name, phone, role, org_name, org_identifier, business_name } = req.body;

    if (!email || !password || !full_name || !role) {
      return res.status(400).json({ success: false, error: 'Email, password, full name, and role are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters long' });
    }

    // Role escalation protection: platform_admin must never be registered publicly
    if (!['customer', 'org_admin', 'owner'].includes(role)) {
      return res.status(403).json({ success: false, error: 'Invalid role. Public registration allows only customer, org_admin, or owner' });
    }

    if (role === 'org_admin' && (!org_name || !org_identifier)) {
      return res.status(400).json({ success: false, error: 'Organisation name and unique identifier are required for organisation admin' });
    }

    if (role === 'owner' && !business_name) {
      return res.status(400).json({ success: false, error: 'Business name is required for parking owner registration' });
    }

    const emailCheck = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
    if (emailCheck.rowCount > 0) {
      return res.status(409).json({ success: false, error: 'An account with this email address already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await withTransaction(async (client) => {
      const userRes = await client.query(
        `INSERT INTO users (email, password_hash, full_name, phone, role, is_active)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         RETURNING id, email, full_name, phone, role, is_active, created_at`,
        [email.trim().toLowerCase(), passwordHash, full_name.trim(), phone ? phone.trim() : null, role]
      );
      const user = userRes.rows[0];

      let org = null;
      let ownerProfile = null;

      if (role === 'org_admin') {
        const orgRes = await client.query(
          `INSERT INTO organisations (admin_user_id, name, org_identifier, approval_status, is_active)
           VALUES ($1, $2, $3, 'pending', TRUE)
           RETURNING id, name, org_identifier, approval_status, is_active`,
          [user.id, org_name.trim(), org_identifier.trim().toUpperCase()]
        );
        org = orgRes.rows[0];
      } else if (role === 'owner') {
        const ownerRes = await client.query(
          `INSERT INTO owner_profiles (user_id, business_name, approval_status)
           VALUES ($1, $2, 'pending')
           RETURNING id, business_name, approval_status`,
          [user.id, business_name.trim()]
        );
        ownerProfile = ownerRes.rows[0];
      }

      return { user, org, ownerProfile };
    });

    const token = jwt.sign(
      { id: result.user.id, email: result.user.email, role: result.user.role },
      config.jwtSecret,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      success: true,
      data: {
        token,
        user: result.user,
        org: result.org,
        ownerProfile: result.ownerProfile
      }
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const userRes = await query(
      'SELECT id, email, password_hash, full_name, phone, role, is_active FROM users WHERE LOWER(email) = LOWER($1)',
      [email.trim()]
    );

    if (userRes.rowCount === 0) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const user = userRes.rows[0];

    if (!user.is_active) {
      return res.status(401).json({ success: false, error: 'This account has been deactivated. Please contact support.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    let org = null;
    let ownerProfile = null;

    if (user.role === 'org_admin') {
      const orgRes = await query(
        'SELECT id, name, org_identifier, approval_status, rejection_reason, is_active FROM organisations WHERE admin_user_id = $1',
        [user.id]
      );
      org = orgRes.rows[0] || null;
    } else if (user.role === 'owner') {
      const ownerRes = await query(
        'SELECT id, business_name, approval_status, rejection_reason FROM owner_profiles WHERE user_id = $1',
        [user.id]
      );
      ownerProfile = ownerRes.rows[0] || null;
    }

    delete user.password_hash;

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      data: {
        token,
        user,
        org,
        ownerProfile
      }
    });
  } catch (err) {
    next(err);
  }
}

async function getMe(req, res, next) {
  try {
    res.json({
      success: true,
      data: {
        user: req.user,
        org: req.user.org || null,
        ownerProfile: req.user.ownerProfile || null
      }
    });
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ success: false, error: 'Current password and new password are required' });
    }

    if (new_password.length < 8) {
      return res.status(400).json({ success: false, error: 'New password must be at least 8 characters long' });
    }

    const userRes = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(current_password, userRes.rows[0].password_hash);

    if (!valid) {
      return res.status(400).json({ success: false, error: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(new_password, 10);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, req.user.id]);

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    next(err);
  }
}

async function updateProfile(req, res, next) {
  try {
    const { full_name, phone } = req.body;

    if (!full_name) {
      return res.status(400).json({ success: false, error: 'Full name is required' });
    }

    const updateRes = await query(
      `UPDATE users
       SET full_name = $1, phone = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, email, full_name, phone, role, is_active`,
      [full_name.trim(), phone ? phone.trim() : null, req.user.id]
    );

    res.json({ success: true, data: updateRes.rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  getMe,
  changePassword,
  updateProfile
};
