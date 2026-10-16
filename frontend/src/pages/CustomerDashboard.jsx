import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Spinner } from '../components/Spinner';
import { EmptyState } from '../components/EmptyState';

export function CustomerDashboard() {
  const [bookings, setBookings] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Periodically refresh client clock so overdue sessions transition out of Active
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [bookRes, memRes] = await Promise.all([
        apiRequest('/api/bookings/mine'),
        apiRequest('/api/membership/status')
      ]);

      if (bookRes.success) {
        setBookings(bookRes.data || []);
      }
      if (memRes.success) {
        setMemberships(memRes.data || []);
      }
    } catch (err) {
      console.error('Failed to load customer dashboard data:', err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // Strict lifecycle filtering:
  // 1. Pending Arrival: booking is pending arrival and deadline has not passed
  const pendingBookings = bookings.filter(b => b.status === 'pending');
  
  // 2. Active Sessions: booking is active AND scheduled end_time has NOT passed
  const activeBookings = bookings.filter(b => b.status === 'active' && new Date(b.end_time).getTime() > currentTime);
  
  // 3. Completed & Bills: session has completed, or session was active and scheduled end_time has passed
  const completedBookings = bookings.filter(b => b.status === 'completed' || (b.status === 'active' && new Date(b.end_time).getTime() <= currentTime));
  
  // 4. Expired & Cancelled: booking expired before entry or was cancelled
  const pastBookings = bookings.filter(b => b.status === 'expired' || b.status === 'cancelled');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 text-left">
      {/* Top Banner: Membership Status & Quick Action */}
      <div className="bg-surface border border-warmgrey rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-charcoal">Customer Parking Portal</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="text-xs text-charcoalMuted">Organisation Status:</span>
            {memberships.length > 0 ? (
              memberships.map((m) => (
                <span key={m.membership_id} className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-900 border border-blue-200">
                  <Badge variant="verified" label={`${m.org_name} (${m.parking_benefit} benefit)`} />
                </span>
              ))
            ) : (
              <span className="text-xs text-charcoalMuted">No organisation linked</span>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Link to="/customer/membership">
            <Button variant="secondary" size="sm">Verify Org Membership</Button>
          </Link>
          <Link to="/search">
            <Button variant="primary" size="sm">Find & Book Parking</Button>
          </Link>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="border-b border-warmgrey flex space-x-2">
        <button
          onClick={() => setActiveTab('pending')}
          className={`py-2 px-4 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'pending'
              ? 'border-amber-600 text-charcoal'
              : 'border-transparent text-charcoalMuted hover:text-charcoal'
          }`}
        >
          Pending Arrival ({pendingBookings.length})
        </button>

        <button
          onClick={() => setActiveTab('active')}
          className={`py-2 px-4 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'active'
              ? 'border-amber-600 text-charcoal'
              : 'border-transparent text-charcoalMuted hover:text-charcoal'
          }`}
        >
          Active Sessions ({activeBookings.length})
        </button>

        <button
          onClick={() => setActiveTab('completed')}
          className={`py-2 px-4 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'completed'
              ? 'border-amber-600 text-charcoal'
              : 'border-transparent text-charcoalMuted hover:text-charcoal'
          }`}
        >
          Completed & Bills ({completedBookings.length})
        </button>

        <button
          onClick={() => setActiveTab('past')}
          className={`py-2 px-4 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'past'
              ? 'border-amber-600 text-charcoal'
              : 'border-transparent text-charcoalMuted hover:text-charcoal'
          }`}
        >
          Expired & Cancelled ({pastBookings.length})
        </button>
      </div>

      {/* Tab Contents */}
      {loading ? (
        <Spinner className="py-12" />
      ) : (
        <div className="space-y-4">
          {/* TAB 1: PENDING ARRIVAL */}
          {activeTab === 'pending' && (
            pendingBookings.length === 0 ? (
              <EmptyState
                title="No pending reservations"
                description="You do not have any upcoming bookings awaiting gate entry."
                action={<Link to="/search"><Button variant="primary" size="sm">Find Parking</Button></Link>}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingBookings.map((b) => (
                  <Card key={b.id} className="p-4 border-amber-300 bg-amber-50/20 shadow-xs">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-mono font-bold text-charcoalMuted">
                        REF #{b.booking_reference}
                      </span>
                      <Badge status={b.status} />
                    </div>
                    <h3 className="text-base font-bold text-charcoal">{b.location_name}</h3>
                    <p className="text-xs text-charcoalMuted">{b.locality || b.address}</p>

                    <div className="mt-3 p-2.5 bg-surface rounded border border-warmgrey text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-charcoalMuted">Vehicle:</span>
                        <span className="font-mono font-bold">{b.vehicle_number}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-charcoalMuted">Arrival Deadline:</span>
                        <span className="font-bold text-amber-900">
                          {new Date(b.arrival_deadline).toLocaleTimeString('en-IN', {
                            timeZone: 'Asia/Kolkata',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-warmgrey flex items-center justify-between">
                      <span className="text-xs font-bold text-charcoal">
                        {Number(b.base_amount_snapshot) === 0 && (b.benefit_applied === 'free' || b.pool === 'member')
                          ? 'Free (Member Benefit)'
                          : `₹${b.base_amount_snapshot} reserved`}
                      </span>
                      <Link to={`/bookings/${b.id}`}>
                        <Button variant="primary" size="sm" className="font-bold">
                          Enter Gate Code & Details
                        </Button>
                      </Link>
                    </div>
                  </Card>
                ))}
              </div>
            )
          )}

          {/* TAB 2: ACTIVE SESSIONS */}
          {activeTab === 'active' && (
            activeBookings.length === 0 ? (
              <EmptyState
                title="No active sessions"
                description="You do not have any vehicles currently parked."
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeBookings.map((b) => {
                  const startDt = new Date(b.entry_time || b.start_time);
                  const endDt = new Date(b.end_time);
                  const formattedDate = startDt.toLocaleDateString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                  });
                  const formattedStart = startDt.toLocaleTimeString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                  });
                  const formattedEnd = endDt.toLocaleTimeString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                  });

                  return (
                    <Card key={b.id} className="p-4 border-emerald-300 bg-emerald-50/20 shadow-xs">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="text-xs font-mono font-bold text-charcoalMuted">
                            REF #{b.booking_reference}
                          </span>
                          <h3 className="text-base font-bold text-charcoal mt-0.5">{b.location_name}</h3>
                          <p className="text-xs text-charcoalMuted">{b.locality || b.address}</p>
                          {b.owner_name && (
                            <p className="text-[11px] text-charcoalMuted mt-0.5">
                              Operator: {b.owner_name}
                            </p>
                          )}
                        </div>
                        <Badge status="active" />
                      </div>

                      <div className="mt-3 p-2.5 bg-surface rounded border border-warmgrey text-xs space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-charcoalMuted">Vehicle:</span>
                          <span className="font-mono font-bold text-charcoal">{b.vehicle_number}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-charcoalMuted">Assigned Spot:</span>
                          <span className="font-bold text-emerald-800">{b.spot_label || b.assigned_spot || 'Bay-General'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-charcoalMuted">Session Started:</span>
                          <span className="font-medium text-charcoal">{formattedDate} at {formattedStart}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-charcoalMuted">Scheduled End:</span>
                          <span className="font-bold text-amber-900">{formattedEnd}</span>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-warmgrey flex items-center justify-between">
                        <span className="text-[11px] text-charcoalMuted">
                          Overtime rate: ₹{b.overtime_rate_snapshot}/min
                        </span>
                        <Link to={`/bookings/${b.id}`}>
                          <Button variant="secondary" size="sm" className="font-semibold">
                            Session Details
                          </Button>
                        </Link>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )
          )}

          {/* TAB 3: COMPLETED & BILLS */}
          {activeTab === 'completed' && (
            completedBookings.length === 0 ? (
              <EmptyState
                title="No completed sessions yet"
                description="Completed parking sessions, invoices, and billing receipts will appear here once your parking stays finish."
                action={<Link to="/search"><Button variant="primary" size="sm">Book a Parking Spot</Button></Link>}
              />
            ) : (
              <div className="space-y-4">
                {completedBookings.map((b) => {
                  const isFree = Number(b.total_amount ?? b.base_amount_snapshot) === 0 && (b.benefit_applied === 'free' || b.pool === 'member');
                  const baseCharge = Number(b.invoice_base_amount ?? b.base_amount_snapshot ?? 0);
                  const overtimeAmount = Number(b.overtime_amount || 0);
                  const overtimeMinutes = Number(b.overtime_minutes || 0);
                  const addonsAmount = Number(b.addons_amount || 0);
                  const totalPayable = isFree ? 0 : Number(b.total_amount ?? (baseCharge + overtimeAmount + addonsAmount));

                  const startDt = new Date(b.entry_time || b.start_time);
                  const endDt = new Date(b.exit_time || b.end_time);
                  const formattedDate = startDt.toLocaleDateString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                  });
                  const formattedStart = startDt.toLocaleTimeString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                  });
                  const formattedEnd = endDt.toLocaleTimeString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                  });

                  const durationMins = b.actual_duration_minutes || Math.max(1, Math.ceil((endDt - startDt) / (60 * 1000)));
                  const durationText = durationMins >= 60
                    ? `${Math.floor(durationMins / 60)}h ${durationMins % 60}m`
                    : `${durationMins} min`;

                  return (
                    <Card key={b.id} className="p-5 border-warmgrey hover:border-amber-400 transition-colors shadow-xs">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-warmgrey/80 pb-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="text-xs font-mono font-bold text-charcoal">
                              REF #{b.booking_reference}
                            </span>
                            <Badge status="completed" />
                            {isFree ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-950 border border-emerald-300">
                                Free Member Benefit
                              </span>
                            ) : b.payment_status === 'paid' ? (
                              <Badge status="paid" label="Paid" />
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-950 border border-amber-300">
                                Payment Pending
                              </span>
                            )}
                            {(b.spot_label || b.assigned_spot) && (
                              <span className="text-[11px] font-mono text-charcoalMuted bg-stone-100 px-2 py-0.5 rounded border border-warmgrey">
                                Spot: {b.spot_label || b.assigned_spot}
                              </span>
                            )}
                          </div>
                          <h4 className="text-base font-bold text-charcoal">{b.location_name}</h4>
                          <p className="text-xs text-charcoalMuted">{b.locality || b.address}</p>
                          {b.owner_name && (
                            <p className="text-[11px] text-charcoalMuted mt-0.5">
                              <span className="font-semibold text-charcoal">Facility Operator:</span> {b.owner_name}
                            </p>
                          )}
                        </div>

                        <div className="sm:text-right shrink-0">
                          <div className="text-xs text-charcoalMuted">Final Amount Payable</div>
                          <div className="text-2xl font-black text-charcoal">
                            {isFree ? (
                              <span className="text-emerald-800">Free</span>
                            ) : (
                              `₹${totalPayable.toFixed(2)}`
                            )}
                          </div>
                          <div className="text-[11px] text-charcoalMuted mt-0.5">
                            {isFree
                              ? 'Covered by organisation'
                              : b.payment_status === 'paid'
                              ? 'Settled'
                              : 'Pending settlement'}
                          </div>
                        </div>
                      </div>

                      {/* Middle Details Grid */}
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-surfaceSoft border border-warmgrey/60 rounded-md text-xs">
                        <div>
                          <span className="text-charcoalMuted text-[11px] block">Vehicle</span>
                          <span className="font-mono font-bold text-charcoal block mt-0.5">
                            {b.vehicle_number}
                          </span>
                          <span className="text-[10px] text-charcoalMuted capitalize">
                            {b.vehicle_type?.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div>
                          <span className="text-charcoalMuted text-[11px] block">Session Date & Time</span>
                          <span className="font-semibold text-charcoal block mt-0.5">
                            {formattedDate}
                          </span>
                          <span className="text-[10px] text-charcoalMuted block">
                            {formattedStart} – {formattedEnd}
                          </span>
                        </div>
                        <div>
                          <span className="text-charcoalMuted text-[11px] block">Duration</span>
                          <span className="font-semibold text-charcoal block mt-0.5">
                            {durationText}
                          </span>
                          <span className="text-[10px] text-charcoalMuted block">
                            Scheduled: {b.quantity} {b.rate_type}(s)
                          </span>
                        </div>
                        <div>
                          <span className="text-charcoalMuted text-[11px] block">Bill Breakdown</span>
                          <div className="text-[11px] text-charcoal mt-0.5 space-y-0.5">
                            <div>Base: <span className="font-semibold">{isFree ? '₹0.00' : `₹${baseCharge.toFixed(2)}`}</span></div>
                            {overtimeAmount > 0 && (
                              <div className="text-amber-800 font-semibold">
                                Extra Time ({overtimeMinutes}m): +₹{overtimeAmount.toFixed(2)}
                              </div>
                            )}
                            {addonsAmount > 0 && (
                              <div className="text-charcoalMuted">
                                Add-ons: +₹{addonsAmount.toFixed(2)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-warmgrey/70 flex flex-col sm:flex-row items-center justify-between gap-3">
                        <div className="text-xs text-charcoalMuted">
                          {b.payment_status === 'paid' ? (
                            <span className="text-emerald-800 font-medium">
                              ✓ Paid via {b.payment_method?.replace(/_/g, ' ') || 'card'} {b.transaction_ref ? `(Ref: ${b.transaction_ref})` : ''}
                            </span>
                          ) : isFree ? (
                            <span className="text-emerald-800 font-medium">
                              ✓ 100% Free Member Stay (No payment required)
                            </span>
                          ) : (
                            <span className="text-amber-900 font-medium">
                              Payment pending. Complete simulated checkout in session details.
                            </span>
                          )}
                        </div>
                        <Link to={`/bookings/${b.id}`}>
                          <Button variant={b.payment_status === 'paid' || isFree ? 'secondary' : 'primary'} size="sm" className="font-bold">
                            {b.payment_status === 'paid' || isFree ? 'View Receipt & Details' : 'Pay / View Invoice'}
                          </Button>
                        </Link>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )
          )}

          {/* TAB 4: EXPIRED & CANCELLED */}
          {activeTab === 'past' && (
            pastBookings.length === 0 ? (
              <EmptyState title="No expired or cancelled bookings" />
            ) : (
              <div className="space-y-3">
                {pastBookings.map((b) => (
                  <Card key={b.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 opacity-90 hover:opacity-100 transition-opacity">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono font-bold text-charcoalMuted">
                          REF #{b.booking_reference}
                        </span>
                        <Badge status={b.status} />
                      </div>
                      <h4 className="text-sm font-bold text-charcoal">{b.location_name}</h4>
                      <p className="text-xs text-charcoalMuted">
                        Vehicle: <span className="font-mono font-medium">{b.vehicle_number}</span> &bull; Scheduled for {new Date(b.start_time).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                      </p>
                      <p className="text-[11px] text-rose-800 mt-0.5">
                        {b.status === 'expired'
                          ? 'Booking expired: gate entry PIN was not verified within the arrival window'
                          : 'Reservation was cancelled'}
                      </p>
                    </div>
                    <Link to={`/bookings/${b.id}`}>
                      <Button variant="ghost" size="sm">Details</Button>
                    </Link>
                  </Card>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

export default CustomerDashboard;

