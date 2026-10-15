const { query } = require('../db/pool');

/**
 * Simulates payment confirmation or failure.
 * Strictly adheres to Section 7: modifies only the payment record.
 */
async function simulatePayment(req, res, next) {
  try {
    const paymentId = Number(req.params.id);
    const { outcome = 'success', method = 'simulated_upi' } = req.body;
    const customerId = req.user.id;

    // Check payment exists and belongs to the customer's booking
    const payCheck = await query(
      `SELECT p.*, b.customer_id
       FROM payments p
       JOIN bookings b ON p.booking_id = b.id
       WHERE p.id = $1`,
      [paymentId]
    );

    if (payCheck.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Payment record not found' });
    }

    const payment = payCheck.rows[0];

    if (payment.customer_id !== customerId && req.user.role !== 'platform_admin') {
      return res.status(403).json({ success: false, error: 'Forbidden: this payment does not belong to your account' });
    }

    if (payment.status === 'paid') {
      return res.status(400).json({ success: false, error: 'Payment has already been marked as paid and cannot be changed' });
    }

    const newStatus = outcome === 'success' ? 'paid' : 'failed';
    const txnRef = `TXN-SIM-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const paidAt = newStatus === 'paid' ? new Date() : null;

    const updateRes = await query(
      `UPDATE payments
       SET status = $1,
           payment_method = $2,
           transaction_ref = $3,
           paid_at = $4,
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [newStatus, method, txnRef, paidAt, paymentId]
    );

    res.json({
      success: true,
      message: newStatus === 'paid' ? 'Payment simulated successfully' : 'Payment simulation marked as failed (retryable)',
      data: updateRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves payment details by ID.
 */
async function getPaymentDetail(req, res, next) {
  try {
    const paymentId = Number(req.params.id);
    const result = await query(
      `SELECT p.*, inv.total_amount, inv.base_amount, inv.overtime_amount, inv.addons_amount, b.booking_reference
       FROM payments p
       JOIN invoices inv ON p.invoice_id = inv.id
       JOIN bookings b ON p.booking_id = b.id
       WHERE p.id = $1`,
      [paymentId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  simulatePayment,
  getPaymentDetail
};
