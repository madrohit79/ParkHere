import React, { useState, useEffect } from 'react';
import { useSearchParams, Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api/client';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Input, Select } from '../components/Input';
import { Spinner } from '../components/Spinner';
import { EmptyState } from '../components/EmptyState';

export function SearchPage() {
  const { user } = useAuth();
  if (user?.role === 'org_admin') {
    return <Navigate to="/org/dashboard" replace />;
  }

  const [searchParams, setSearchParams] = useSearchParams();

  const [locality, setLocality] = useState(searchParams.get('locality') || '');
  const [vehicleType, setVehicleType] = useState(searchParams.get('vehicle_type') || '');
  const [maxPrice, setMaxPrice] = useState(searchParams.get('max_price') || '');
  const [hasCctv, setHasCctv] = useState(searchParams.get('has_cctv') === 'true');
  const [hasGuard, setHasGuard] = useState(searchParams.get('has_guard') === 'true');
  const [isCovered, setIsCovered] = useState(searchParams.get('is_covered') === 'true');
  const [facility, setFacility] = useState(searchParams.get('facility') || '');
  const [durationHours, setDurationHours] = useState('2');

  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);

  async function fetchLocations() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (locality.trim()) params.set('locality', locality.trim());
      if (vehicleType) params.set('vehicle_type', vehicleType);
      if (maxPrice) params.set('max_price', maxPrice);
      if (hasCctv) params.set('has_cctv', 'true');
      if (hasGuard) params.set('has_guard', 'true');
      if (isCovered) params.set('is_covered', 'true');
      if (facility) params.set('facility', facility);
      if (durationHours) params.set('duration_hours', durationHours);

      const res = await apiRequest(`/api/locations?${params.toString()}`);
      if (res.success && Array.isArray(res.data)) {
        setLocations(res.data);
      }
    } catch (err) {
      console.error('Error searching locations:', err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLocations();
  }, [searchParams]);

  function handleFilterSubmit(e) {
    e.preventDefault();
    const newParams = new URLSearchParams();
    if (locality.trim()) newParams.set('locality', locality.trim());
    if (vehicleType) newParams.set('vehicle_type', vehicleType);
    if (maxPrice) newParams.set('max_price', maxPrice);
    if (hasCctv) newParams.set('has_cctv', 'true');
    if (hasGuard) newParams.set('has_guard', 'true');
    if (isCovered) newParams.set('is_covered', 'true');
    if (facility) newParams.set('facility', facility);
    setSearchParams(newParams);
  }

  function handleReset() {
    setLocality('');
    setVehicleType('');
    setMaxPrice('');
    setHasCctv(false);
    setHasGuard(false);
    setIsCovered(false);
    setFacility('');
    setDurationHours('2');
    setSearchParams({});
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col md:flex-row gap-6">
        {/* Filter Sidebar */}
        <aside className="w-full md:w-72 shrink-0">
          <Card title="Filter Parking" subtitle="Live capacity calculations">
            <form onSubmit={handleFilterSubmit} className="space-y-4">
              <Input
                label="Locality / Area"
                value={locality}
                onChange={(e) => setLocality(e.target.value)}
                placeholder="e.g. City Center, Main St"
              />

              <Select
                label="Vehicle Compatibility"
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value)}
              >
                <option value="">All Supported Vehicles</option>
                <option value="four_wheeler">4 Wheeler (Car)</option>
                <option value="two_wheeler">2 Wheeler (Bike/Scooter)</option>
                <option value="ev">Electric Vehicle (EV)</option>
                <option value="heavy">Heavy Vehicle</option>
              </Select>

              <Select
                label="Booking Duration"
                value={durationHours}
                onChange={(e) => setDurationHours(e.target.value)}
              >
                <option value="1">1 Hour</option>
                <option value="2">2 Hours</option>
                <option value="4">4 Hours</option>
                <option value="8">8 Hours</option>
                <option value="24">1 Day (24h)</option>
              </Select>

              <Input
                label="Max Hourly Rate (₹)"
                type="number"
                min="0"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="e.g. 50"
              />

              <Select
                label="Offered Facility"
                value={facility}
                onChange={(e) => setFacility(e.target.value)}
              >
                <option value="">Any Facilities</option>
                <option value="EV_CHARGING">EV Charging Station</option>
                <option value="VEHICLE_CLEANING">Vehicle Cleaning</option>
                <option value="TYRE_AIR_FILLING">Tyre Air Filling</option>
              </Select>

              {/* Security Checkboxes */}
              <div className="space-y-2 pt-2 border-t border-warmgrey text-xs">
                <span className="font-bold text-charcoal block">Amenities & Security</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasCctv}
                    onChange={(e) => setHasCctv(e.target.checked)}
                    className="rounded border-warmgrey text-amber-600 focus:ring-amber-500"
                  />
                  <span>CCTV Surveillance</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasGuard}
                    onChange={(e) => setHasGuard(e.target.checked)}
                    className="rounded border-warmgrey text-amber-600 focus:ring-amber-500"
                  />
                  <span>Security Guard</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isCovered}
                    onChange={(e) => setIsCovered(e.target.checked)}
                    className="rounded border-warmgrey text-amber-600 focus:ring-amber-500"
                  />
                  <span>Covered / Shaded</span>
                </label>
              </div>

              <div className="pt-2 flex gap-2">
                <Button type="submit" variant="primary" size="sm" className="flex-1 font-bold">
                  Apply Filters
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={handleReset}>
                  Reset
                </Button>
              </div>
            </form>
          </Card>
        </aside>

        {/* Results List */}
        <main className="flex-1">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-lg font-bold text-charcoal">
              Available Parking Locations ({locations.length})
            </h1>
            <span className="text-xs text-charcoalMuted">Live availability</span>
          </div>

          {loading ? (
            <Spinner />
          ) : locations.length === 0 ? (
            <EmptyState
              title="No parking locations match your search"
              description="Try adjusting your filters, relaxing the max price, or selecting all vehicle types."
              action={
                <Button variant="secondary" size="sm" onClick={handleReset}>
                  Clear All Filters
                </Button>
              }
            />
          ) : (
            <div className="space-y-4">
              {locations.map((loc) => (
                <Card key={loc.id} className="p-4 sm:p-5 hover:border-amber-400 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-cream border border-warmgrey text-charcoal">
                          {loc.locality}
                        </span>
                        {loc.is_user_verified_member && (
                          <Badge variant="verified" label="Member Allocation Visible" />
                        )}
                      </div>

                      <h3 className="text-base font-bold text-charcoal">
                        <Link to={`/locations/${loc.id}`} className="hover:text-amber-700">
                          {loc.name}
                        </Link>
                      </h3>
                      <p className="text-xs text-charcoalMuted">{loc.address}</p>

                      {/* Amenities & Badges */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {loc.has_cctv && (
                          <span className="text-[11px] bg-stone-100 text-charcoal px-2 py-0.5 rounded border border-warmgrey">
                            CCTV
                          </span>
                        )}
                        {loc.has_guard && (
                          <span className="text-[11px] bg-stone-100 text-charcoal px-2 py-0.5 rounded border border-warmgrey">
                            Guard on duty
                          </span>
                        )}
                        {loc.is_covered && (
                          <span className="text-[11px] bg-stone-100 text-charcoal px-2 py-0.5 rounded border border-warmgrey">
                            Covered
                          </span>
                        )}
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded border ${
                          loc.is_currently_open 
                            ? 'bg-emerald-50 text-emerald-900 border-emerald-300' 
                            : 'bg-rose-50 text-rose-900 border-rose-300'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${loc.is_currently_open ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                          {loc.is_currently_open ? 'Open Now' : 'Currently Closed'}
                        </span>
                        <span className="text-[11px] bg-stone-100 text-charcoal px-2 py-0.5 rounded border border-warmgrey">
                          {loc.operating_hours || (loc.is_24_7 ? '24/7 Access' : `${loc.opens_at} - ${loc.closes_at}`)}
                        </span>
                      </div>

                      {loc.is_closed_for_requested_time && (
                        <div className="mt-2 text-xs text-rose-900 bg-rose-50 border border-rose-200 px-2.5 py-1.5 rounded flex items-start gap-1.5">
                          <span className="font-bold shrink-0">⚠️ Facility Closed:</span>
                          <span>{loc.closure_reason || 'This parking facility is closed during your requested time window.'}</span>
                        </div>
                      )}

                      {/* Offered Facilities */}
                      {loc.facilities && loc.facilities.length > 0 && (
                        <div className="pt-1 flex flex-wrap items-center gap-2">
                          <span className="text-xs text-charcoalMuted font-medium">Add-ons:</span>
                          {loc.facilities.map((fac, idx) => (
                            <span key={idx} className="text-[11px] bg-amber-50 text-amber-900 border border-amber-200 px-1.5 py-0.5 rounded">
                              {fac.name} (+₹{fac.price})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Capacity & Price column */}
                    <div className="sm:text-right border-t sm:border-t-0 pt-3 sm:pt-0 border-warmgrey flex sm:flex-col justify-between items-end gap-3 shrink-0">
                      <div>
                        <div className="text-xs text-charcoalMuted">Public Spaces</div>
                        <div className="text-sm font-bold text-emerald-800">
                          {loc.available_public} / {loc.public_capacity} available
                        </div>
                        {loc.is_user_verified_member && loc.member_capacity > 0 && (
                          <div className="mt-1 text-xs text-blue-900 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                            Member: {loc.available_member} / {loc.member_capacity}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="text-base font-black text-charcoal">
                          ₹{loc.hourly_rate} <span className="text-xs font-normal text-charcoalMuted">/hr</span>
                        </div>
                        {loc.daily_rate && (
                          <div className="text-[11px] text-charcoalMuted">
                            Daily: ₹{loc.daily_rate}
                          </div>
                        )}
                      </div>

                      <Link to={`/locations/${loc.id}`}>
                        <Button variant="primary" size="sm" className="font-bold">
                          View & Book
                        </Button>
                      </Link>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default SearchPage;
