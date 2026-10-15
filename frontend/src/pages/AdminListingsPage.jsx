import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { Card } from '../components/Card';
import { Table } from '../components/Table';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Spinner } from '../components/Spinner';
import { Alert } from '../components/Alert';

export function AdminListingsPage() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    fetchLocations();
  }, []);

  async function fetchLocations() {
    setLoading(true);
    try {
      const res = await apiRequest('/api/admin/locations');
      if (res.success) {
        setLocations(res.data || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch platform parking locations');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleActive(loc) {
    setFeedback(null);
    try {
      const res = await apiRequest(`/api/admin/locations/${loc.id}/toggle-active`, {
        method: 'PATCH'
      });
      if (res.success) {
        setLocations((prev) =>
          prev.map((l) => (l.id === loc.id ? { ...l, is_active: !l.is_active } : l))
        );
        setFeedback({
          type: 'success',
          message: `Location "${loc.name}" is now ${!loc.is_active ? 'active and searchable' : 'hidden from search'}.`
        });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to toggle location status' });
    }
  }

  const filteredLocations = locations.filter((loc) => {
    const matchesSearch =
      loc.name.toLowerCase().includes(search.toLowerCase()) ||
      loc.locality.toLowerCase().includes(search.toLowerCase());

    const matchesType = typeFilter === 'all' || loc.provider_type === typeFilter;

    return matchesSearch && matchesType;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-warmgrey">
        <div>
          <div className="text-xs text-charcoalMuted mb-1">
            <Link to="/admin/dashboard" className="hover:underline">Dashboard</Link> / Parking Locations
          </div>
          <h1 className="text-2xl font-black text-charcoal">Platform Parking Inventory</h1>
          <p className="text-xs text-charcoalMuted mt-1">
            Audit parking locations, capacity pools, tariffs, and visibility status
          </p>
        </div>

        <Button variant="secondary" size="sm" onClick={fetchLocations}>
          Refresh Listings
        </Button>
      </div>

      {feedback && <Alert type={feedback.type} message={feedback.message} />}
      {error && <Alert type="error" message={error} />}

      {/* Filter Row */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 max-w-md">
          <Input
            placeholder="Search by location name or locality..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded border transition-colors ${
              typeFilter === 'all' ? 'bg-accent/40 border-amber-400 font-bold' : 'bg-surface border-warmgrey text-charcoalMuted'
            }`}
          >
            All Types
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('org')}
            className={`px-3 py-1.5 text-xs font-semibold rounded border transition-colors ${
              typeFilter === 'org' ? 'bg-accent/40 border-amber-400 font-bold' : 'bg-surface border-warmgrey text-charcoalMuted'
            }`}
          >
            Institutions (Campus)
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('owner')}
            className={`px-3 py-1.5 text-xs font-semibold rounded border transition-colors ${
              typeFilter === 'owner' ? 'bg-accent/40 border-amber-400 font-bold' : 'bg-surface border-warmgrey text-charcoalMuted'
            }`}
          >
            Private Lots
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <Table
            headers={['ID', 'Location Name', 'Provider Type', 'Locality', 'Capacities (Pub/Mem)', 'Hourly Rate', 'Listing State', 'Actions']}
          >
            {filteredLocations.length === 0 ? (
              <tr>
                <td colSpan="8" className="px-4 py-8 text-center text-charcoalMuted text-xs">
                  No parking locations found.
                </td>
              </tr>
            ) : (
              filteredLocations.map((loc) => (
                <tr key={loc.id} className="hover:bg-cream/40 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-charcoalMuted">#{loc.id}</td>
                  <td className="px-4 py-3 text-xs">
                    <Link to={`/locations/${loc.id}`} className="font-bold text-charcoal hover:underline">
                      {loc.name}
                    </Link>
                    {loc.is_demo && (
                      <span className="ml-2 inline-block px-1.5 py-0.2 rounded text-[10px] bg-stone-100 text-stone-600 border border-warmgrey">
                        demo seed
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                      loc.provider_type === 'org' ? 'bg-blue-100 text-blue-950 border border-blue-300' : 'bg-amber-100 text-amber-950 border border-amber-300'
                    }`}>
                      {loc.provider_type === 'org' ? (loc.org_name || 'Institution') : (loc.owner_name || 'Private Owner')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-charcoalMuted">
                    {loc.locality}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono font-semibold">
                    <span className="text-charcoal">{loc.public_capacity} pub</span> / <span className="text-amber-900">{loc.member_capacity} mem</span>
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold">
                    ₹{loc.hourly_rate || '—'} / hr
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold ${
                      loc.is_active ? 'bg-emerald-100 text-emerald-950 border border-emerald-300' : 'bg-rose-100 text-rose-950 border border-rose-300'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${loc.is_active ? 'bg-emerald-600' : 'bg-rose-600'}`} />
                      {loc.is_active ? 'Active' : 'Hidden'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(loc)}
                      className={`text-xs font-semibold px-2.5 py-1 rounded border transition-colors ${
                        loc.is_active
                          ? 'text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100'
                          : 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                      }`}
                    >
                      {loc.is_active ? 'Hide Listing' : 'Make Active'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </Table>
        </Card>
      )}
    </div>
  );
}

export default AdminListingsPage;
