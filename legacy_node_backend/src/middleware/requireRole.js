/**
 * Role-Based Access Control Middleware
 */

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: role '${req.user.role}' is not authorized to access this resource`
      });
    }

    next();
  };
}

/**
 * Gatekeeper for provider routes (organisations and owners).
 * Ensures provider has been approved by the platform administrator.
 */
function requireApprovedProvider(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  if (req.user.role === 'platform_admin') {
    return next(); // Platform admin always has access
  }

  if (req.user.role === 'org_admin') {
    if (!req.user.org) {
      return res.status(403).json({ success: false, error: 'No organisation profile linked to this account' });
    }
    if (req.user.org.approval_status !== 'approved') {
      return res.status(403).json({
        success: false,
        error: `Organisation account is ${req.user.org.approval_status}. Pending administrator approval.`,
        approval_status: req.user.org.approval_status,
        rejection_reason: req.user.org.rejection_reason
      });
    }
    if (!req.user.org.is_active) {
      return res.status(403).json({ success: false, error: 'Organisation is deactivated' });
    }
    return next();
  }

  if (req.user.role === 'owner') {
    if (!req.user.ownerProfile) {
      return res.status(403).json({ success: false, error: 'No owner profile linked to this account' });
    }
    if (req.user.ownerProfile.approval_status !== 'approved') {
      return res.status(403).json({
        success: false,
        error: `Owner account is ${req.user.ownerProfile.approval_status}. Pending administrator approval.`,
        approval_status: req.user.ownerProfile.approval_status,
        rejection_reason: req.user.ownerProfile.rejection_reason
      });
    }
    return next();
  }

  return res.status(403).json({ success: false, error: 'Access restricted to approved providers' });
}

module.exports = {
  requireRole,
  requireApprovedProvider
};
