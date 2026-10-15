import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, Navigate } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Spinner } from '../components/Spinner';
import { Alert } from '../components/Alert';
import { BookingFlowModal } from './BookingFlowModal';

export function LocationDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  if (user?.role === 'org_admin') {
    return <Navigate to="/org/dashboard" replace />;
  }

  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);

  useEffect(() => {
    async function fetchDetail() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiRequest(`/api/locations/${id}`);
        if (res.success && res.data) {
          setLocation(res.data);
        }
      } catch (err) {
        setError(err.message || 'Failed to load parking location details');
      } finally {
        setLoading(false);
      }
    }

    fetchDetail();
  }, [id]);

  function handleOpenBooking() {
    if (!user) {
      navigate('/login', { state: { returnUrl: `/locations/${id}` } });
      return;
    }
    setIsBookingModalOpen(true);
  }

  if (loading) return <Spinner className="py-24" />;

  if (error || !location) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Alert type="error" message={error || 'Location not found'} />
        <div className="mt-4">
          <Link to="/search">
            <Button variant="secondary" size="sm">Back to Search</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Main Header Card */}
      <div className="bg-surface border border-warmgrey rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-start justify-between gap-6">
        <div className="space-y-3 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-cream border border-warmgrey text-charcoal">
              {location.locality}
            </span>
            {location.is_user_verified_member && (
              <Badge variant="verified" label="Verified Member Allocation Active" />
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-charcoal tracking-tight">
            {location.name}
          </h1>

          <p className="text-sm text-charcoalMuted flex items-center gap-1.5">
            <svg className="w-4 h-4 text-charcoalMuted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {location.address}
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            {location.has_cctv && (
              <span className="text-xs bg-stone-100 text-charcoal px-2.5 py-1 rounded border border-warmgrey font-medium">
                CCTV Surveillance
              </span>
            )}
            {location.has_guard && (
              <span className="text-xs bg-stone-100 text-charcoal px-2.5 py-1 rounded border border-warmgrey font-medium">
                Security Guard
              </span>
            )}
            {location.is_covered && (
              <span className="text-xs bg-stone-100 text-charcoal px-2.5 py-1 rounded border border-warmgrey font-medium">
                Covered Parking
              </span>
            )}
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded border ${
              location.is_currently_open 
                ? 'bg-emerald-50 text-emerald-900 border-emerald-300' 
                : 'bg-rose-50 text-rose-900 border-rose-300'
            }`}>
              <span className={`w-2 h-2 rounded-full ${location.is_currently_open ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              {location.is_currently_open ? 'Open Now' : 'Currently Closed'}
            </span>
            <span className="text-xs bg-stone-100 text-charcoal px-2.5 py-1 rounded border border-warmgrey font-medium">
              Hours: {location.operating_hours || (location.is_24_7 ? '24/7 Access' : `${location.opens_at} - ${location.closes_at}`)}
            </span>
          </div>
        </div>

        {/* Pricing & Booking action CTA card */}
        <div className="w-full md:w-80 p-5 bg-surfaceSoft border border-warmgrey rounded-lg flex flex-col justify-between shrink-0 shadow-xs">
          <div className="space-y-3">
            <div>
              <div className="text-xs text-charcoalMuted">Starting from</div>
              <div className="text-3xl font-black text-charcoal">
                ₹{location.hourly_rate} <span className="text-xs font-normal text-charcoalMuted">/hour</span>
              </div>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-warmgrey text-xs">
              <div className="flex justify-between items-center">
                <span className="text-charcoalMuted">Operating Status:</span>
                <span className={`font-bold flex items-center gap-1.5 ${location.is_currently_open ? 'text-emerald-800' : 'text-rose-800'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${location.is_currently_open ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  {location.is_currently_open ? 'Open Now' : 'Closed Now'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-charcoalMuted">Schedule:</span>
                <span className="font-semibold">{location.operating_hours || (location.is_24_7 ? '24/7' : 'Standard')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-charcoalMuted">Available Public:</span>
                <span className="font-bold text-emerald-800">{location.available_public} / {location.public_capacity}</span>
              </div>
              {location.member_capacity > 0 && (
                <div className="flex justify-between">
                  <span className="text-charcoalMuted">Member Allocation:</span>
                  <span className="font-bold text-blue-900">
                    {location.is_user_verified_member ? `${location.available_member} / ${location.member_capacity}` : 'Members only'}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-charcoalMuted">
                <span>Overtime rate:</span>
                <span>₹{location.overtime_rate_per_minute}/min</span>
              </div>
            </div>

            {!location.is_24_7 && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-950">
                <div className="font-bold flex items-center gap-1">
                  <span>Operating Hours:</span>
                  <span>{location.operating_hours}</span>
                </div>
                <div className="text-[11px] text-amber-800 mt-0.5">
                  Reservations outside operating hours will be rejected by the system.
                </div>
              </div>
            )}
          </div>

          <div className="pt-5">
            <Button
              variant="primary"
              size="lg"
              onClick={handleOpenBooking}
              className="w-full font-bold shadow-sm py-3"
            >
              Book Parking Space
            </Button>
            {!user && (
              <p className="text-[11px] text-center text-charcoalMuted mt-2">
                Sign in required to confirm reservation
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Grid: Tariffs & Vehicle Types, Facilities */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Tariffs Schedule */}
        <Card title="Pricing Tariffs Schedule" subtitle="Snapshotted at reservation time">
          <div className="divide-y divide-warmgrey text-sm">
            {location.hourly_rate && (
              <div className="py-2.5 flex justify-between">
                <span className="text-charcoal font-medium">Hourly Rate</span>
                <span className="font-bold text-charcoal">₹{location.hourly_rate}</span>
              </div>
            )}
            {location.daily_rate && (
              <div className="py-2.5 flex justify-between">
                <span className="text-charcoal font-medium">Daily Rate (24h)</span>
                <span className="font-bold text-charcoal">₹{location.daily_rate}</span>
              </div>
            )}
            {location.weekly_rate && (
              <div className="py-2.5 flex justify-between">
                <span className="text-charcoal font-medium">Weekly Rate (7 days)</span>
                <span className="font-bold text-charcoal">₹{location.weekly_rate}</span>
              </div>
            )}
            {location.monthly_rate && (
              <div className="py-2.5 flex justify-between">
                <span className="text-charcoal font-medium">Monthly Rate (30 days)</span>
                <span className="font-bold text-charcoal">₹{location.monthly_rate}</span>
              </div>
            )}
            <div className="py-2.5 flex justify-between bg-amber-50/50 -mx-5 px-5">
              <span className="text-charcoal font-medium">Overtime Per-Minute Fee</span>
              <span className="font-bold text-amber-900">₹{location.overtime_rate_per_minute} / min</span>
            </div>
            {location.member_discount_percent > 0 && (
              <div className="py-2.5 flex justify-between bg-blue-50/50 -mx-5 px-5">
                <span className="text-blue-950 font-medium">Verified Member Discount</span>
                <span className="font-bold text-blue-900">{location.member_discount_percent}% off base rate</span>
              </div>
            )}
          </div>
        </Card>

        {/* Facilities & Vehicle Compatibility */}
        <div className="space-y-6">
          <Card title="Supported Vehicle Types" subtitle="Permitted entry categories">
            <div className="flex flex-wrap gap-2">
              {location.vehicle_types?.map((vt) => (
                <span key={vt} className="px-3 py-1.5 rounded bg-cream border border-warmgrey text-xs font-bold text-charcoal">
                  {vt.replace('_', ' ').toUpperCase()}
                </span>
              ))}
            </div>
          </Card>

          <Card title="Available On-Site Facility Add-ons" subtitle="Optional services available during your booking">
            {location.facilities?.length > 0 ? (
              <div className="space-y-3">
                {location.facilities.map((fac) => (
                  <div key={fac.code} className="flex items-start justify-between p-3 rounded bg-surfaceSoft border border-warmgrey">
                    <div>
                      <div className="text-sm font-bold text-charcoal">{fac.name}</div>
                      {fac.description && <div className="text-xs text-charcoalMuted mt-0.5">{fac.description}</div>}
                    </div>
                    <span className="text-sm font-black text-amber-900 shrink-0 ml-4">
                      +₹{fac.price}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-charcoalMuted">No additional facilities offered at this location.</p>
            )}
          </Card>
        </div>
      </div>

      {/* Booking Flow Modal */}
      <BookingFlowModal
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
        location={location}
      />
    </div>
  );
}

export default LocationDetailPage;
