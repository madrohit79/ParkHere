/**
 * ParkHere Billing & Pricing Calculation Utilities
 * Strictly follows Section 7 of the specification.
 */

/**
 * Calculates the booking base amount based on unit price, quantity, and applied membership benefit.
 *
 * @param {number} unitPrice - snapshotted rate (per hour, day, week, month)
 * @param {number} quantity - positive integer count
 * @param {string} benefitApplied - 'none' | 'free' | 'discounted' | 'standard'
 * @param {number} discountPercent - discount percentage for 'discounted' member (0 to 100)
 * @returns {number} rounded to 2 decimal places
 */
function calculateBaseAmount(unitPrice, quantity, benefitApplied = 'none', discountPercent = 0) {
  const rawBase = Number(unitPrice) * Number(quantity);

  if (benefitApplied === 'free') {
    return 0.00;
  }

  if (benefitApplied === 'discounted' && Number(discountPercent) > 0) {
    const discounted = rawBase * (1 - Number(discountPercent) / 100);
    return Math.round(discounted * 100) / 100;
  }

  return Math.round(rawBase * 100) / 100;
}

/**
 * Calculates overtime minutes and overtime charges upon actual vehicle exit.
 * Formula:
 * overtime_minutes = max(0, CEIL((actual_exit - scheduled_end) in minutes))
 * overtime_amount  = overtime_minutes * overtime_rate_snapshot
 *
 * @param {Date|string} scheduledEnd
 * @param {Date|string} actualExit
 * @param {number} overtimeRatePerMinute
 * @returns {{ overtimeMinutes: number, overtimeAmount: number }}
 */
function calculateOvertime(scheduledEnd, actualExit, overtimeRatePerMinute) {
  const endMs = new Date(scheduledEnd).getTime();
  const exitMs = new Date(actualExit).getTime();

  const diffMs = exitMs - endMs;
  if (diffMs <= 0) {
    return { overtimeMinutes: 0, overtimeAmount: 0.00 };
  }

  const overtimeMinutes = Math.ceil(diffMs / (1000 * 60));
  const overtimeAmount = Math.round(overtimeMinutes * Number(overtimeRatePerMinute) * 100) / 100;

  return {
    overtimeMinutes,
    overtimeAmount
  };
}

/**
 * Calculates total bill including base amount, overtime, and add-on facility fees.
 *
 * @param {number} baseAmount
 * @param {number} overtimeAmount
 * @param {number} addonsAmount
 * @returns {number} total amount rounded to 2 decimal places
 */
function calculateTotalBill(baseAmount, overtimeAmount, addonsAmount = 0.00) {
  const total = Number(baseAmount) + Number(overtimeAmount) + Number(addonsAmount);
  return Math.round(total * 100) / 100;
}

module.exports = {
  calculateBaseAmount,
  calculateOvertime,
  calculateTotalBill
};
