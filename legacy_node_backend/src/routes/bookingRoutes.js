const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { requireRole, requireApprovedProvider } = require('../middleware/requireRole');
const { verifyLimiter } = require('../middleware/rateLimiter');

// Public/optional auth estimation
router.post('/estimate', optionalAuth, bookingController.estimateBooking);

// Customer bookings
router.post('/', authenticateToken, requireRole('customer'), bookingController.createBooking);
router.get('/mine', authenticateToken, requireRole('customer'), bookingController.getCustomerBookings);

// Operator list routes
router.get('/operator/pending', authenticateToken, requireRole('org_admin', 'owner'), requireApprovedProvider, bookingController.getOperatorPending);
router.get('/operator/active', authenticateToken, requireRole('org_admin', 'owner'), requireApprovedProvider, bookingController.getOperatorActive);
router.get('/operator/completed', authenticateToken, requireRole('org_admin', 'owner'), requireApprovedProvider, bookingController.getOperatorCompleted);

// Specific booking operations
router.get('/:id', authenticateToken, bookingController.getBookingDetail);
router.post('/:id/cancel', authenticateToken, requireRole('customer'), bookingController.cancelBooking);
router.post('/:id/generate-code', authenticateToken, requireRole('org_admin', 'owner', 'platform_admin'), requireApprovedProvider, bookingController.generateGateCode);
router.post('/:id/verify', authenticateToken, requireRole('customer', 'platform_admin'), verifyLimiter, bookingController.verifyArrivalCode);
router.post('/:id/exit', authenticateToken, requireRole('org_admin', 'owner'), requireApprovedProvider, bookingController.recordExit);

module.exports = router;
