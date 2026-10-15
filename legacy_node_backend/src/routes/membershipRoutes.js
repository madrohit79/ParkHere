const express = require('express');
const router = express.Router();
const membershipController = require('../controllers/membershipController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

router.post('/verify', authenticateToken, requireRole('customer'), membershipController.verifyMembership);
router.get('/status', authenticateToken, requireRole('customer'), membershipController.getCustomerMemberships);

module.exports = router;
