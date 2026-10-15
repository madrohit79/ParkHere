import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api/client';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Spinner } from '../components/Spinner';
import { Alert } from '../components/Alert';

export function OrgDashboard() {
  const { user, isApproved, approvalStatus } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isApproved) {
      navigate('/awaiting-approval');
      return;
    }

    async function loadData() {
      try {
        const res = await apiRequest('/api/org/profile');
        if (res.success) {
          setData(res.data);
        }
      } catch (err) {
        setError(err.message || 'Failed to load organization profile');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [isApproved, navigate]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  const { profile, locations, members, bookings } = data || {};

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-warmgrey">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-charcoal">{profile?.name || 'Organization Dashboard'}</h1>
            <span className="px-2 py-0.5 rounded text-xs font-bold uppercase bg-amber-100 text-amber-900 border border-amber-300">
              {profile?.org_identifier}
            </span>
          </div>
          <p className="text-xs text-charcoalMuted mt-1">
            Institutional campus parking management, member directory verification, and gate controls
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link to="/org/locations">
            <Button variant="secondary" size="md">
              Manage Locations & Tariffs
            </Button>
          </Link>
          <Link to="/org/members">
            <Button variant="secondary" size="md">
              Member Directory
            </Button>
          </Link>
          <Link to="/org/terminal">
            <Button variant="primary" size="md">
              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Open Gate Terminal
            </Button>
          </Link>
        </div>
      </div>

      {error && <Alert type="error" message={error} />}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 border-l-4 border-l-amber-500">
          <div className="text-xs font-bold uppercase tracking-wider text-charcoalMuted">Campus Locations</div>
          <div className="text-3xl font-black text-charcoal mt-2">{locations?.location_count || 0}</div>
          <div className="text-xs text-charcoalMuted mt-1">
            {locations?.total_member_capacity || 0} member + {locations?.total_public_capacity || 0} public spots
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-emerald-500">
          <div className="text-xs font-bold uppercase tracking-wider text-charcoalMuted">Member Directory</div>
          <div className="text-3xl font-black text-charcoal mt-2">{members?.active_members || 0}</div>
          <div className="text-xs text-charcoalMuted mt-1">
            {members?.free_members || 0} free tier, {members?.discounted_members || 0} discounted
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-blue-500">
          <div className="text-xs font-bold uppercase tracking-wider text-charcoalMuted">Active Parked Now</div>
          <div className="text-3xl font-black text-charcoal mt-2">{bookings?.active_sessions || 0}</div>
          <div className="text-xs text-charcoalMuted mt-1">
            {bookings?.pending_bookings || 0} vehicles approaching gate
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-purple-500">
          <div className="text-xs font-bold uppercase tracking-wider text-charcoalMuted">Total Admissions</div>
          <div className="text-3xl font-black text-charcoal mt-2">{bookings?.completed_sessions || 0}</div>
          <div className="text-xs text-charcoalMuted mt-1">
            {bookings?.total_bookings || 0} lifetime reservations
          </div>
        </Card>
      </div>

      {/* Quick Administrative Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-2">
        <Card
          title="Campus Locations"
          subtitle="Facility capacities, operating hours & rules"
          footer={
            <Link to="/org/locations">
              <Button variant="secondary" size="sm" className="w-full">
                Manage Locations →
              </Button>
            </Link>
          }
        >
          <p className="text-xs text-charcoalMuted leading-relaxed">
            Configure campus parking bays, member vs public splits, operating hours (24/7 or custom), and facility amenities.
          </p>
        </Card>

        <Card
          title="Tariff Rates"
          subtitle="Hourly, daily & overtime rates"
          footer={
            <Link to="/org/locations">
              <Button variant="secondary" size="sm" className="w-full">
                Configure Tariffs →
              </Button>
            </Link>
          }
        >
          <p className="text-xs text-charcoalMuted leading-relaxed">
            Update hourly rates, daily passes, overtime fees, and member discount percentages for all institutional lots.
          </p>
        </Card>

        <Card
          title="Gate Terminal & Bookings"
          subtitle="6-digit entry PINs, bays & departures"
          footer={
            <Link to="/org/terminal">
              <Button variant="primary" size="sm" className="w-full">
                Open Terminal →
              </Button>
            </Link>
          }
        >
          <p className="text-xs text-charcoalMuted leading-relaxed">
            Generate 6-digit gate entry codes for approaching drivers, assign bays, monitor active parked vehicles, and record exits.
          </p>
        </Card>

        <Card
          title="Member Directory"
          subtitle="Student & faculty benefit rosters"
          footer={
            <Link to="/org/members">
              <Button variant="secondary" size="sm" className="w-full">
                Manage Directory →
              </Button>
            </Link>
          }
        >
          <p className="text-xs text-charcoalMuted leading-relaxed">
            Register authorized roll numbers, department emails, and grant free or discounted parking tier benefits.
          </p>
        </Card>
      </div>
    </div>
  );
}

export default OrgDashboard;
