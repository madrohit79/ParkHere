import React, { useState, useEffect } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Countdown } from '../components/Countdown';
import { Spinner } from '../components/Spinner';
import { Alert } from '../components/Alert';

export function BookingDetailPage() {
  const { id } = useParams();
  const routeState = useLocation().state;

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [inputCode, setInputCode] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyFeedback, setVerifyFeedback] = useState(null);

  async function handleVerifyGateCode(e) {
    if (e) e.preventDefault();
    if (!inputCode || inputCode.trim().length !== 6) {
      setVerifyFeedback({
        type: 'error',
        message: 'Please enter a valid 6-digit numeric gate entry code.'
      });
      return;
    }

    setVerifyLoading(true);
    setVerifyFeedback(null);
    try {
      const res = await apiRequest(`/api/bookings/${id}/verify`, {
        method: 'POST',
        body: { code: inputCode.trim() }
      });

      if (res.success) {
        setVerifyFeedback({
          type: 'success',
          message: res.message || 'Gate entry code verified successfully! Entry barrier opened.'
        });
        setInputCode('');
        await fetchBooking();
      }
    } catch (err) {
      setVerifyFeedback({
        type: 'error',
        message: err.message || 'Verification failed. Please check the code and try again.'
      });
    } finally {
      setVerifyLoading(false);
    }
  }

  async function fetchBooking() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest(`/api/bookings/${id}`);
      if (res.success && res.data) {
        setBooking(res.data);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch booking details');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchBooking();
  }, [id]);

  async function handleSimulatePayment(outcome) {
    if (!booking?.invoice?.payment_id) return;
    setPaymentProcessing(true);
    try {
      await apiRequest(`/api/payments/${booking.invoice.payment_id}/simulate`, {
        method: 'POST',
        body: { outcome, method: 'simulated_upi' }
      });
      await fetchBooking();
    } catch (err) {
      alert(`Payment simulation error: ${err.message}`);
    } finally {
      setPaymentProcessing(false);
    }
  }

  async function handleCancelBooking() {
    if (!window.confirm('Are you sure you want to cancel this reservation? The parking space will be released.')) {
      return;
    }
    setCancelLoading(true);
    try {
      await apiRequest(`/api/bookings/${id}/cancel`, { method: 'POST' });
      await fetchBooking();
    } catch (err) {
      alert(`Cancellation failed: ${err.message}`);
    } finally {
      setCancelLoading(false);
    }
  }

  if (loading) return <Spinner className="py-24" />;

  if (error || !booking) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Alert type="error" message={error || 'Booking not found'} />
        <div className="mt-4">
          <Link to="/customer/dashboard">
            <Button variant="secondary" size="sm">Back to My Bookings</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Display initial plaintext code if returned in route state immediately after booking
  const codeToDisplay = booking.arrival_code || routeState?.initialCode || null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 text-left">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-warmgrey">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono font-bold text-charcoalMuted">
              {booking.booking_reference}
            </span>
            <Badge status={booking.status} />
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-charcoal tracking-tight">
            Reservation at {booking.location_name}
          </h1>
          <p className="text-xs text-charcoalMuted mt-0.5">{booking.address}</p>
        </div>

        <Link to="/customer/dashboard">
          <Button variant="secondary" size="sm">Back to Dashboard</Button>
        </Link>
      </div>

      {/* 1. PENDING GATE CODE ENTRY CARD */}
      {booking.status === 'pending' && (
        <Card className="bg-amber-50/50 border-amber-300">
          <div className="space-y-4 p-2 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-amber-200">
              <div>
                <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-amber-200/80 text-[11px] font-bold text-amber-950 mb-1">
                  Arrival Gate Verification
                </div>
                <h2 className="text-base sm:text-lg font-bold text-charcoal">
                  Enter Gate Entry Code to Open Barrier
                </h2>
                <p className="text-xs text-charcoalMuted">
                  The gate operator issues your arrival code when you arrive at the gate terminal. Enter the code below to verify and unlock the barrier.
                </p>
              </div>

              {booking.arrival_deadline && (
                <div className="flex flex-col sm:items-end">
                  <span className="text-[11px] font-semibold text-charcoalMuted">Arrival Window</span>
                  <Countdown
                    deadline={booking.arrival_deadline}
                    serverTime={booking.server_time}
                    onExpire={() => fetchBooking()}
                  />
                </div>
              )}
            </div>

            {/* Operator Code Issuance Status */}
            {booking.has_code_generated ? (
              <div className="p-4 bg-emerald-50/70 border border-emerald-300 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-950">
                    <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                    Gate Entry Code Issued by Operator
                  </div>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    Your single-use gate entry code has been generated. Enter it in the field below to open the barrier.
                  </p>
                  {booking.assigned_spot && (
                    <div className="mt-1 text-xs text-emerald-950 font-bold">
                      Assigned Parking Bay: <span className="font-mono bg-white px-2 py-0.5 rounded border border-emerald-300">{booking.assigned_spot}</span>
                    </div>
                  )}
                </div>
                {booking.arrival_code && (
                  <div className="text-center p-2.5 bg-white rounded-md border border-emerald-300 min-w-[140px]">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-charcoalMuted block">Your Code</span>
                    <span className="text-2xl font-black font-mono tracking-widest text-emerald-950">{booking.arrival_code}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 bg-amber-100/60 border border-amber-300 rounded-lg text-xs text-amber-950 space-y-1">
                <div className="font-bold flex items-center gap-2">
                  <svg className="w-4 h-4 text-amber-700 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  Awaiting Operator to Generate Code
                </div>
                <p className="text-charcoalMuted">
                  Please drive up to the parking facility barrier. The organization gate operator will issue your entry code, which will appear here or be communicated to you at the gate.
                </p>
              </div>
            )}

            {/* Input Form for Customer to enter gate code */}
            <form onSubmit={handleVerifyGateCode} className="p-4 bg-white border border-warmgrey rounded-lg space-y-3">
              <label htmlFor="gate-entry-code-input" className="block text-xs font-bold text-charcoal">
                Enter Gate Entry Code <span className="text-rose-600">*</span>
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  id="gate-entry-code-input"
                  type="text"
                  maxLength={6}
                  placeholder="e.g. 123456"
                  value={inputCode}
                  onChange={(e) => {
                    setInputCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                    setVerifyFeedback(null);
                  }}
                  className="flex-1 text-center font-mono text-xl font-bold tracking-widest px-4 py-2 border border-warmgrey rounded-md bg-stone-50 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  className="font-bold sm:min-w-[180px]"
                  loading={verifyLoading}
                  disabled={!inputCode || inputCode.length !== 6}
                >
                  Verify Code & Enter Gate
                </Button>
              </div>

              {verifyFeedback && (
                <Alert type={verifyFeedback.type} message={verifyFeedback.message} />
              )}
            </form>

            <div className="pt-2 flex items-center justify-between text-xs text-charcoalMuted">
              <span>Need to cancel before entering?</span>
              <Button
                variant="danger"
                size="sm"
                loading={cancelLoading}
                onClick={handleCancelBooking}
              >
                Cancel Reservation
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* 2. ACTIVE SESSION CARD */}
      {booking.status === 'active' && (
        <Card className="bg-emerald-50/40 border-emerald-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse" />
                <h3 className="text-base font-bold text-emerald-950">Vehicle Currently Parked</h3>
              </div>
              <p className="text-xs text-charcoalMuted">
                Session entry recorded at: {new Date(booking.session?.entry_time || booking.start_time).toLocaleTimeString()}
              </p>
              {booking.session?.spot_label && (
                <div className="text-xs font-bold text-charcoal">
                  Assigned Bay / Spot: <span className="font-mono bg-white px-2 py-0.5 rounded border border-warmgrey">{booking.session.spot_label}</span>
                </div>
              )}
            </div>

            <div className="text-right">
              <div className="text-xs text-charcoalMuted">Scheduled End Time</div>
              <div className="text-sm font-bold text-charcoal">
                {new Date(booking.end_time).toLocaleTimeString()}
              </div>
              <div className="text-[10px] text-charcoalMuted mt-0.5">
                Overtime starts after scheduled end at ₹{booking.overtime_rate_snapshot}/min
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* 3. INVOICE & SIMULATED BILLING (COMPLETED) */}
      {booking.invoice && (
        <Card title="Parking Invoice & Billing Receipt" subtitle={`Generated at ${new Date(booking.invoice.generated_at).toLocaleString()}`}>
          <div className="space-y-4">
            <div className="divide-y divide-warmgrey text-sm">
              <div className="py-2.5 flex justify-between">
                <span className="text-charcoal">Base Reserved Amount:</span>
                <span className="font-semibold text-charcoal">
                  {Number(booking.invoice.base_amount) === 0 && (booking.benefit_applied === 'free' || booking.pool === 'member')
                    ? '₹0.00 (Member Free Parking)'
                    : `₹${booking.invoice.base_amount}`}
                </span>
              </div>

              {Number(booking.invoice.overtime_amount) > 0 && (
                <div className="py-2.5 flex justify-between bg-amber-50/50 -mx-5 px-5">
                  <div>
                    <span className="text-amber-950 font-medium">Overtime Charges</span>
                    <span className="text-xs text-amber-800 ml-2">({booking.invoice.overtime_minutes} minutes)</span>
                  </div>
                  <span className="font-bold text-amber-900">+₹{booking.invoice.overtime_amount}</span>
                </div>
              )}

              {Number(booking.invoice.addons_amount) > 0 && (
                <div className="py-2.5 flex justify-between">
                  <span className="text-charcoal">Facility Add-on Services:</span>
                  <span className="font-semibold text-charcoal">+₹{booking.invoice.addons_amount}</span>
                </div>
              )}

              <div className="py-3 flex justify-between text-base font-black text-charcoal border-t-2 border-charcoal">
                <span>Total Billed Amount:</span>
                <span>₹{booking.invoice.total_amount}</span>
              </div>
            </div>

            {/* Simulated Payment Section */}
            <div className="p-4 bg-surfaceSoft border border-warmgrey rounded-lg flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <div className="text-xs font-bold text-charcoal flex items-center gap-2">
                  <span>Payment Status:</span>
                  <Badge status={booking.invoice.payment_status} />
                </div>
                {booking.invoice.payment_status === 'paid' ? (
                  <p className="text-xs text-charcoalMuted mt-1">
                    Transaction Ref: <span className="font-mono">{booking.invoice.transaction_ref}</span> on {new Date(booking.invoice.paid_at).toLocaleString()}
                  </p>
                ) : (
                  <p className="text-xs text-charcoalMuted mt-1">
                    Simulate customer checkout. Modifies payment status only; invoices remain uncorrupted.
                  </p>
                )}
              </div>

              {booking.invoice.payment_status !== 'paid' && (
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    loading={paymentProcessing}
                    onClick={() => handleSimulatePayment('success')}
                  >
                    Pay (Simulate Success)
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    loading={paymentProcessing}
                    onClick={() => handleSimulatePayment('failed')}
                  >
                    Simulate Failed
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* 4. DETAILS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Booking Specs */}
        <Card title="Reservation Specifications">
          <div className="divide-y divide-warmgrey text-xs space-y-2">
            <div className="pt-2 flex justify-between">
              <span className="text-charcoalMuted">Vehicle Registration:</span>
              <span className="font-bold font-mono text-charcoal">{booking.vehicle_number}</span>
            </div>
            <div className="pt-2 flex justify-between">
              <span className="text-charcoalMuted">Vehicle Type:</span>
              <span className="font-bold text-charcoal">{booking.vehicle_type?.replace('_', ' ').toUpperCase()}</span>
            </div>
            <div className="pt-2 flex justify-between">
              <span className="text-charcoalMuted">Inventory Pool:</span>
              <span className="font-bold text-charcoal capitalize">{booking.pool} pool</span>
            </div>
            <div className="pt-2 flex justify-between">
              <span className="text-charcoalMuted">Scheduled Time:</span>
              <span className="font-medium text-charcoal">
                {new Date(booking.start_time).toLocaleTimeString()} – {new Date(booking.end_time).toLocaleTimeString()}
              </span>
            </div>
            <div className="pt-2 flex justify-between">
              <span className="text-charcoalMuted">Date:</span>
              <span className="font-medium text-charcoal">
                {new Date(booking.start_time).toLocaleDateString()}
              </span>
            </div>
            <div className="pt-2 flex justify-between">
              <span className="text-charcoalMuted">Membership Benefit:</span>
              <span className="font-bold text-charcoal capitalize">{booking.benefit_applied || 'None'}</span>
            </div>
            <div className="pt-2 flex justify-between">
              <span className="text-charcoalMuted">Reserved Base Charge:</span>
              <span className="font-bold text-charcoal">
                {Number(booking.base_amount_snapshot) === 0 && (booking.benefit_applied === 'free' || booking.pool === 'member')
                  ? 'Free (₹0.00)'
                  : `₹${booking.base_amount_snapshot}`}
              </span>
            </div>
          </div>
        </Card>

        {/* Audit Timeline */}
        <Card title="Booking Audit Timeline" subtitle="Logged automatically via database triggers">
          <div className="space-y-3">
            {booking.timeline && booking.timeline.length > 0 ? (
              booking.timeline.map((evt, idx) => (
                <div key={idx} className="flex items-start gap-3 text-xs">
                  <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                  <div>
                    <div className="font-bold text-charcoal">{evt.event_type.replace(/_/g, ' ')}</div>
                    <div className="text-[11px] text-charcoalMuted">{new Date(evt.created_at).toLocaleTimeString()} - {evt.notes}</div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-charcoalMuted">No timeline events recorded.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default BookingDetailPage;
