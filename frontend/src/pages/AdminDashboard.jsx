import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Spinner } from '../components/Spinner';
import { Alert } from '../components/Alert';

export function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await apiRequest('/api/admin/stats');
        if (res.success) {
          setStats(res.data);
        }
      } catch (err) {
        setError(err.message || 'Failed to load system statistics');
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  const { users, providers, locations, bookings, revenue } = stats || {};
  const totalPending = (Number(providers?.pending_orgs) || 0) + (Number(providers?.pending_owners) || 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-warmgrey">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-charcoal">Platform Administration</h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-950 border border-rose-300">
              Superadmin
            </span>
          </div>
          <p className="text-xs text-charcoalMuted mt-1">
            Global system monitoring, provider approvals, and platform inventory management
          </p>
        </div>

        {totalPending > 0 && (
          <Link to="/admin/approvals">
            <Button variant="danger" size="sm" className="font-bold flex items-center gap-1.5 animate-bounce">
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              {totalPending} Provider Application{totalPending > 1 ? 's' : ''} Pending Review
            </Button>
          </Link>
        )}
      </div>

      {error && <Alert type="error" message={error} />}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 border-l-4 border-l-amber-500">
          <div className="text-xs font-bold uppercase tracking-wider text-charcoalMuted">Total Platform Users</div>
          <div className="text-3xl font-black text-charcoal mt-2">{users?.total_users || 0}</div>
          <div className="text-xs text-charcoalMuted mt-1">
            {users?.customers_count || 0} drivers, {users?.org_admins_count || 0} orgs, {users?.owners_count || 0} owners
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-emerald-500">
          <div className="text-xs font-bold uppercase tracking-wider text-charcoalMuted">Parking Lots Listed</div>
          <div className="text-3xl font-black text-charcoal mt-2">{locations?.total_locations || 0}</div>
          <div className="text-xs text-charcoalMuted mt-1">
            {locations?.active_locations || 0} active, {locations?.total_locations || 0} total
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-blue-500">
          <div className="text-xs font-bold uppercase tracking-wider text-charcoalMuted">Total Bookings</div>
          <div className="text-3xl font-black text-charcoal mt-2">{bookings?.total_bookings || 0}</div>
          <div className="text-xs text-charcoalMuted mt-1">
            {bookings?.active_sessions || 0} active now, {bookings?.completed_bookings || 0} completed
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-purple-500">
          <div className="text-xs font-bold uppercase tracking-wider text-charcoalMuted">Invoiced Gross Volume</div>
          <div className="text-3xl font-black text-charcoal mt-2">
            ₹{Number(revenue?.gross_revenue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-charcoalMuted mt-1">
            Base charges + overtime penalties
          </div>
        </Card>
      </div>

      {/* Administration Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
        <Card
          title="Provider Approvals"
          subtitle="Review incoming organization and private lot provider applications"
          footer={
            <Link to="/admin/approvals">
              <Button variant={totalPending > 0 ? 'primary' : 'secondary'} size="sm" className="w-full">
                {totalPending > 0 ? `Review Pending (${totalPending}) →` : 'View Provider Log →'}
              </Button>
            </Link>
          }
        >
          <p className="text-xs text-charcoalMuted leading-relaxed">
            Verify newly registered institutional administrators and private lot owners. Enforces platform integrity before parking inventory is published to motorists.
          </p>
        </Card>

        <Card
          title="User Management"
          subtitle="View and toggle user account statuses"
          footer={
            <Link to="/admin/users">
              <Button variant="secondary" size="sm" className="w-full">
                Manage Users ({users?.total_users || 0}) →
              </Button>
            </Link>
          }
        >
          <p className="text-xs text-charcoalMuted leading-relaxed">
            Directory of registered drivers, organization admins, and space providers. Instantly activate or suspend user access with immediate JWT session validation checks.
          </p>
        </Card>

        <Card
          title="Listings Moderation"
          subtitle="Audit all parking locations, capacities, and tariffs"
          footer={
            <Link to="/admin/listings">
              <Button variant="secondary" size="sm" className="w-full">
                View All Listings ({locations?.total_locations || 0}) →
              </Button>
            </Link>
          }
        >
          <p className="text-xs text-charcoalMuted leading-relaxed">
            Monitor public and member capacity splits across all facilities. Toggle listing visibility or audit pricing schedules across the network.
          </p>
        </Card>
      </div>
    </div>
  );
}

export default AdminDashboard;
