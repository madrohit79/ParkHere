import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api/client';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Spinner } from '../components/Spinner';
import { Alert } from '../components/Alert';

export function OwnerDashboard() {
  const { isApproved } = useAuth();
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
        const res = await apiRequest('/api/owner/profile');
        if (res.success) {
          setData(res.data);
        }
      } catch (err) {
        setError(err.message || 'Failed to load owner profile');
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

  const { profile, metrics } = data || {};

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-warmgrey">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-charcoal">{profile?.business_name || 'Lot Owner Dashboard'}</h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-950 border border-emerald-300">
              Verified Partner
            </span>
          </div>
          <p className="text-xs text-charcoalMuted mt-1">
            Private parking lot monetization, tariff controls, and entry gate dispatch
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/owner/terminal">
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
          <div className="text-xs font-bold uppercase tracking-wider text-charcoalMuted">Registered Lots</div>
          <div className="text-3xl font-black text-charcoal mt-2">{metrics?.location_count || 0}</div>
          <div className="text-xs text-charcoalMuted mt-1">
            {metrics?.total_capacity || 0} total parking spots
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-emerald-500">
          <div className="text-xs font-bold uppercase tracking-wider text-charcoalMuted">Parked Right Now</div>
          <div className="text-3xl font-black text-charcoal mt-2">{metrics?.active_sessions || 0}</div>
          <div className="text-xs text-charcoalMuted mt-1">
            Live occupied parking bays
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-blue-500">
          <div className="text-xs font-bold uppercase tracking-wider text-charcoalMuted">Total Admissions</div>
          <div className="text-3xl font-black text-charcoal mt-2">{metrics?.completed_sessions || 0}</div>
          <div className="text-xs text-charcoalMuted mt-1">
            {metrics?.total_bookings || 0} lifetime reservations
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-teal-500">
          <div className="text-xs font-bold uppercase tracking-wider text-charcoalMuted">Total Revenue</div>
          <div className="text-3xl font-black text-charcoal mt-2">
            ₹{Number(metrics?.total_revenue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-charcoalMuted mt-1">
            Invoiced and collected
          </div>
        </Card>
      </div>

      {/* Quick Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
        <Card
          title="My Parking Locations"
          subtitle="Configure private parking spaces, pricing, and amenities"
          footer={
            <Link to="/owner/locations">
              <Button variant="secondary" size="sm" className="w-full">
                Manage Locations →
              </Button>
            </Link>
          }
        >
          <p className="text-xs text-charcoalMuted leading-relaxed">
            Create and edit parking facilities. Set competitive hourly and daily rates, configure security amenities (CCTV surveillance, guard on duty, covered parking), and inspect spot availability.
          </p>
        </Card>

        <Card
          title="Gate Operator Terminal"
          subtitle="Scan 6-digit codes and check vehicles out at the exit barrier"
          footer={
            <Link to="/owner/terminal">
              <Button variant="primary" size="sm" className="w-full">
                Launch Terminal →
              </Button>
            </Link>
          }
        >
          <p className="text-xs text-charcoalMuted leading-relaxed">
            Dedicated gate operator interface. Verify incoming drivers via their 6-digit cryptographic arrival PIN, record check-in times with spot allocation, and compute exit invoices with automated overtime billing.
          </p>
        </Card>
      </div>
    </div>
  );
}

export default OwnerDashboard;
