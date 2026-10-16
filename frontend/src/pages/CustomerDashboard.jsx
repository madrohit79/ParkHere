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

  async function loadData() {
    setLoading(true);
    try {
      const [bookRes, memRes] = await Promise.all([
        apiRequest('/api/bookings/mine'),
        apiRequest('/api/membership/status')
      ]);

      if (bookRes.success) setBookings(bookRes.data);
      if (memRes.success) setMemberships(memRes.data);
    } catch (err) {
      console.error('Failed to load customer dashboard data:', err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const pendingBookings = bookings.filter(b => b.status === 'pending');
  const activeBookings = bookings.filter(b => b.status === 'active');
  const completedBookings = bookings.filter(b => b.status === 'completed');
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
                  <Card key={b.id} className="p-4 border-amber-300 bg-amber-50/20">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-mono font-bold text-charcoalMuted">{b.booking_reference}</span>
                      <Badge status={b.status} />
                    </div>
                    <h3 className="text-base font-bold text-charcoal">{b.location_name}</h3>
                    <p className="text-xs text-charcoalMuted">{b.locality}</p>

                    <div className="mt-3 p-2 bg-surface rounded border border-warmgrey text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-charcoalMuted">Vehicle:</span>
                        <span className="font-mono font-bold">{b.vehicle_number}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-charcoalMuted">Arrival Deadline:</span>
                        <span className="font-bold text-amber-900">{new Date(b.arrival_deadline).toLocaleTimeString()}</span>
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

          {activeTab === 'active' && (
            activeBookings.length === 0 ? (
              <EmptyState
                title="No active sessions"
                description="You do not have any vehicles currently parked."
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeBookings.map((b) => (
                  <Card key={b.id} className="p-4 border-emerald-300 bg-emerald-50/20">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-mono font-bold text-charcoalMuted">{b.booking_reference}</span>
                      <Badge status={b.status} />
                    </div>
                    <h3 className="text-base font-bold text-charcoal">{b.location_name}</h3>
                    <p className="text-xs text-charcoalMuted">{b.address}</p>

                    <div className="mt-3 p-2 bg-surface rounded border border-warmgrey text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-charcoalMuted">Vehicle:</span>
                        <span className="font-mono font-bold">{b.vehicle_number}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-charcoalMuted">Scheduled End:</span>
                        <span className="font-bold">{new Date(b.end_time).toLocaleTimeString()}</span>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-warmgrey flex justify-end">
                      <Link to={`/bookings/${b.id}`}>
                        <Button variant="secondary" size="sm">Session Details</Button>
                      </Link>
                    </div>
                  </Card>
                ))}
              </div>
            )
          )}

          {activeTab === 'completed' && (
            completedBookings.length === 0 ? (
              <EmptyState title="No completed trips yet" />
            ) : (
              <div className="space-y-3">
                {completedBookings.map((b) => (
                  <Card key={b.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono font-bold text-charcoalMuted">{b.booking_reference}</span>
                        <Badge status="completed" />
                        {b.payment_status && <Badge status={b.payment_status} />}
                      </div>
                      <h4 className="text-sm font-bold text-charcoal">{b.location_name}</h4>
                      <p className="text-xs text-charcoalMuted">
                        Vehicle: <span className="font-mono font-medium">{b.vehicle_number}</span> &bull; {new Date(b.start_time).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-4 border-t sm:border-t-0 pt-2 sm:pt-0 border-warmgrey">
                      <div className="text-right">
                        <div className="text-xs text-charcoalMuted">Billed Total</div>
                        <div className="text-base font-black text-charcoal">
                          {Number(b.total_amount || b.base_amount_snapshot) === 0 && (b.benefit_applied === 'free' || b.pool === 'member')
                            ? 'Free'
                            : `₹${b.total_amount || b.base_amount_snapshot}`}
                        </div>
                      </div>
                      <Link to={`/bookings/${b.id}`}>
                        <Button variant="secondary" size="sm">View Receipt / Pay</Button>
                      </Link>
                    </div>
                  </Card>
                ))}
              </div>
            )
          )}

          {activeTab === 'past' && (
            pastBookings.length === 0 ? (
              <EmptyState title="No expired or cancelled bookings" />
            ) : (
              <div className="space-y-3">
                {pastBookings.map((b) => (
                  <Card key={b.id} className="p-4 flex items-center justify-between opacity-80">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-charcoalMuted">{b.booking_reference}</span>
                        <Badge status={b.status} />
                      </div>
                      <h4 className="text-sm font-semibold text-charcoal">{b.location_name}</h4>
                      <p className="text-xs text-charcoalMuted">{new Date(b.start_time).toLocaleString()}</p>
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
