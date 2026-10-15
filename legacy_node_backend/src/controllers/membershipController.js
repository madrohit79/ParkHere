const { query } = require('../db/pool');

/**
 * Verifies customer organisation membership based on Section 5.
 */
async function verifyMembership(req, res, next) {
  try {
    const { org_identifier, member_identifier, full_name, email } = req.body;
    const customerId = req.user.id;

    if (!org_identifier || !member_identifier || !full_name || !email) {
      return res.status(400).json({
        success: false,
        error: 'Organisation identifier, member identifier, full name, and email are all required'
      });
    }

    // 1. Verify organisation exists, is approved, and active
    const orgRes = await query(
      `SELECT id, name, is_active, approval_status 
       FROM organisations 
       WHERE UPPER(TRIM(org_identifier)) = UPPER(TRIM($1))`,
      [org_identifier.trim()]
    );

    if (orgRes.rowCount === 0 || orgRes.rows[0].approval_status !== 'approved' || !orgRes.rows[0].is_active) {
      return res.status(400).json({
        success: false,
        error: 'Organisation not found, awaiting approval, or inactive'
      });
    }

    const org = orgRes.rows[0];

    // 2. Check if customer already holds a verified membership with this organisation
    const existingMembership = await query(
      `SELECT cm.id 
       FROM customer_memberships cm
       JOIN org_members om ON cm.org_member_id = om.id
       WHERE cm.customer_id = $1 AND om.org_id = $2 AND cm.status = 'verified'`,
      [customerId, org.id]
    );

    if (existingMembership.rowCount > 0) {
      return res.status(409).json({
        success: false,
        error: 'You already have an active verified membership with this organisation'
      });
    }

    // 3. Match member record (identifier + name + email, trimmed and case-insensitive)
    const memberRes = await query(
      `SELECT id, parking_benefit, is_active
       FROM org_members
       WHERE org_id = $1
         AND UPPER(TRIM(member_identifier)) = UPPER(TRIM($2))
         AND LOWER(TRIM(full_name)) = LOWER(TRIM($3))
         AND LOWER(TRIM(email)) = LOWER(TRIM($4))`,
      [org.id, member_identifier.trim(), full_name.trim(), email.trim()]
    );

    if (memberRes.rowCount === 0) {
      return res.status(400).json({
        success: false,
        error: 'Submitted details do not match any active member record in this organisation'
      });
    }

    const memberRecord = memberRes.rows[0];

    if (!memberRecord.is_active) {
      return res.status(400).json({
        success: false,
        error: 'This membership record is currently inactive'
      });
    }

    // 4. Ensure member record is not already linked to another customer account
    const linkedCheck = await query(
      'SELECT id FROM customer_memberships WHERE org_member_id = $1 AND status = $2',
      [memberRecord.id, 'verified']
    );

    if (linkedCheck.rowCount > 0) {
      return res.status(409).json({
        success: false,
        error: 'This membership record is already linked to another account'
      });
    }

    // 5. Create verified customer membership record
    const insertRes = await query(
      `INSERT INTO customer_memberships (customer_id, org_member_id, status)
       VALUES ($1, $2, 'verified')
       RETURNING id, customer_id, org_member_id, status, verified_at`,
      [customerId, memberRecord.id]
    );

    res.status(201).json({
      success: true,
      message: 'Organisation membership verified successfully',
      data: {
        membership: insertRes.rows[0],
        org_name: org.name,
        parking_benefit: memberRecord.parking_benefit
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Returns all verified memberships for the logged in customer.
 */
async function getCustomerMemberships(req, res, next) {
  try {
    const customerId = req.user.id;
    const result = await query(
      `SELECT 
         cm.id AS membership_id,
         cm.status,
         cm.verified_at,
         om.member_identifier,
         om.parking_benefit,
         om.is_active AS member_is_active,
         o.id AS org_id,
         o.name AS org_name,
         o.org_identifier
       FROM customer_memberships cm
       JOIN org_members om ON cm.org_member_id = om.id
       JOIN organisations o ON om.org_id = o.id
       WHERE cm.customer_id = $1
       ORDER BY cm.verified_at DESC`,
      [customerId]
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
  verifyMembership,
  getCustomerMemberships
};
