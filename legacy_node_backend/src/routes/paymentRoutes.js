const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

router.post('/:id/simulate', authenticateToken, requireRole('customer'), paymentController.simulatePayment);
router.get('/:id', authenticateToken, paymentController.getPaymentDetail);

module.exports = router;
