import React, { useState, useEffect } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api/client';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Spinner } from '../components/Spinner';

export function LandingPage() {
  const { user } = useAuth();
  if (user?.role === 'org_admin') {
    return <Navigate to="/org/dashboard" replace />;
  }

  const navigate = useNavigate();
  const [locality, setLocality] = useState('');
  const [vehicleType, setVehicleType] = useState('four_wheeler');
  const [featuredLocations, setFeaturedLocations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadFeatured() {
      try {
        const res = await apiRequest('/api/locations');
        if (res.success && Array.isArray(res.data)) {
          setFeaturedLocations(res.data.slice(0, 4));
        }
      } catch (err) {
        console.error('Failed to load locations:', err.message);
      } finally {
        setLoading(false);
      }
    }
    loadFeatured();
  }, []);

  function handleSearch(e) {
    e.preventDefault();
    const query = new URLSearchParams();
    if (locality.trim()) query.set('locality', locality.trim());
    if (vehicleType) query.set('vehicle_type', vehicleType);
    navigate(`/search?${query.toString()}`);
  }

  return (
    <div className="space-y-12 pb-16">
      {/* Hero Section */}
      <section className="max-w-5xl mx-auto px-4 text-center pt-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface border border-warmgrey text-xs font-semibold text-charcoal mb-4 shadow-2xs">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Smart Parking Network
        </div>
        <h1 className="text-3xl sm:text-5xl font-black text-charcoal tracking-tight max-w-3xl mx-auto leading-tight">
          Smart Parking Management & Reservation
        </h1>
        <p className="mt-4 text-sm sm:text-base text-charcoalMuted max-w-2xl mx-auto leading-relaxed">
          Reserve parking spaces in advance or on arrival. Featuring real-time slot availability, instant digital gate passes, flexible overtime billing, and partner member benefits.
        </p>

        {/* Quick Search Form */}
        <div className="mt-8 max-w-3xl mx-auto bg-surface p-4 sm:p-6 rounded-xl border border-warmgrey shadow-md text-left">
          <form onSubmit={handleSearch} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-charcoal mb-1">Locality or Area</label>
              <input
                type="text"
                placeholder="e.g. City Center, Railway Station, Main St"
                value={locality}
                onChange={(e) => setLocality(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-cream/40 border border-warmgrey rounded focus:ring-1 focus:ring-amber-500 focus:border-amber-600"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-charcoal mb-1">Vehicle Type</label>
              <select
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-cream/40 border border-warmgrey rounded focus:ring-1 focus:ring-amber-500 focus:border-amber-600"
              >
                <option value="four_wheeler">4 Wheeler (Car)</option>
                <option value="two_wheeler">2 Wheeler (Bike/Scooter)</option>
                <option value="ev">Electric Vehicle (EV)</option>
                <option value="heavy">Heavy Vehicle (Bus/Truck)</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button type="submit" variant="primary" className="w-full py-2.5 font-bold shadow-sm">
                Search Spaces
              </Button>
            </div>
          </form>
        </div>
      </section>

      {/* How It Works Grid */}
      <section className="max-w-6xl mx-auto px-4">
        <h2 className="text-xl font-bold text-charcoal text-center mb-6">How ParkHere Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4 bg-surface">
            <div className="w-8 h-8 rounded bg-amber-100 border border-amber-300 flex items-center justify-center font-bold text-amber-900 mb-3 text-sm">
              01
            </div>
            <h3 className="text-sm font-bold text-charcoal">Find & Reserve</h3>
            <p className="text-xs text-charcoalMuted mt-1 leading-relaxed">
              Browse real-time available spots filtered by vehicle type, amenities, and hourly pricing tariffs.
            </p>
          </Card>

          <Card className="p-4 bg-surface">
            <div className="w-8 h-8 rounded bg-amber-100 border border-amber-300 flex items-center justify-center font-bold text-amber-900 mb-3 text-sm">
              02
            </div>
            <h3 className="text-sm font-bold text-charcoal">Digital Gate Pass</h3>
            <p className="text-xs text-charcoalMuted mt-1 leading-relaxed">
              Instant 6-digit cryptographic entry code generated for quick barrier check-in upon arrival.
            </p>
          </Card>

          <Card className="p-4 bg-surface">
            <div className="w-8 h-8 rounded bg-amber-100 border border-amber-300 flex items-center justify-center font-bold text-amber-900 mb-3 text-sm">
              03
            </div>
            <h3 className="text-sm font-bold text-charcoal">Transparent Billing</h3>
            <p className="text-xs text-charcoalMuted mt-1 leading-relaxed">
              Clear upfront rates with automatic overtime protection snapshotted at reservation time.
            </p>
          </Card>

          <Card className="p-4 bg-surface">
            <div className="w-8 h-8 rounded bg-amber-100 border border-amber-300 flex items-center justify-center font-bold text-amber-900 mb-3 text-sm">
              04
            </div>
            <h3 className="text-sm font-bold text-charcoal">Member Benefits</h3>
            <p className="text-xs text-charcoalMuted mt-1 leading-relaxed">
              Verified organization and campus members unlock reserved capacity and partner discounted rates.
            </p>
          </Card>
        </div>
      </section>

      {/* Featured Locations */}
      <section className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-charcoal">Available Parking Facilities</h2>
            <p className="text-xs text-charcoalMuted mt-0.5">Explore popular and high-demand parking locations</p>
          </div>
          <Link to="/search">
            <Button variant="secondary" size="sm">View All Listings</Button>
          </Link>
        </div>

        {loading ? (
          <Spinner />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {featuredLocations.map((loc) => (
              <Card key={loc.id} className="flex flex-col justify-between hover:border-amber-400 transition-colors">
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {loc.available_public} spaces available
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-charcoal line-clamp-1">{loc.name}</h3>
                  <p className="text-xs text-charcoalMuted mt-0.5">{loc.locality}</p>
                  <p className="text-xs text-charcoalLight/80 line-clamp-2 mt-1">{loc.address}</p>

                  <div className="mt-3 flex flex-wrap gap-1">
                    {loc.has_cctv && <span className="text-[10px] bg-stone-100 px-1.5 py-0.5 rounded border border-warmgrey">CCTV</span>}
                    {loc.has_guard && <span className="text-[10px] bg-stone-100 px-1.5 py-0.5 rounded border border-warmgrey">Guard</span>}
                    {loc.is_covered && <span className="text-[10px] bg-stone-100 px-1.5 py-0.5 rounded border border-warmgrey">Covered</span>}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-warmgrey flex items-center justify-between">
                  <div>
                    <span className="text-xs text-charcoalMuted">From</span>
                    <span className="text-base font-bold text-charcoal ml-1">₹{loc.hourly_rate}</span>
                    <span className="text-[10px] text-charcoalMuted">/hr</span>
                  </div>
                  <Link to={`/locations/${loc.id}`}>
                    <Button variant="primary" size="sm">Details</Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default LandingPage;
