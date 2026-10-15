import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { Spinner } from '../components/Spinner';
import { Alert } from '../components/Alert';

export function OwnerLocationsPage() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState(null);

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTariffModalOpen, setIsTariffModalOpen] = useState(false);
  const [selectedLoc, setSelectedLoc] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [addFormError, setAddFormError] = useState('');
  const [editFormError, setEditFormError] = useState('');

  // Form State
  const [addForm, setAddForm] = useState({
    name: '',
    address: '',
    locality: '',
    public_capacity: 25,
    hourly_rate: 30,
    daily_rate: 200,
    is_24_7: true,
    opens_at: '',
    closes_at: '',
    has_cctv: true,
    has_guard: false,
    is_covered: true
  });

  const [editForm, setEditForm] = useState({
    id: null,
    name: '',
    address: '',
    locality: '',
    public_capacity: 0,
    is_24_7: true,
    opens_at: '',
    closes_at: '',
    has_cctv: false,
    has_guard: false,
    is_covered: false
  });

  const [tariffForm, setTariffForm] = useState({
    hourly_rate: '',
    daily_rate: '',
    weekly_rate: '',
    monthly_rate: '',
    overtime_rate_per_minute: 1.00
  });

  useEffect(() => {
    fetchLocations();
  }, []);

  async function fetchLocations() {
    setLoading(true);
    try {
      const res = await apiRequest('/api/locations/mine');
      if (res.success) {
        setLocations(res.data || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch owner locations');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddLocation(e) {
    e.preventDefault();
    setAddFormError('');

    if (!addForm.is_24_7) {
      if (!addForm.opens_at || !addForm.closes_at) {
        setAddFormError('Please provide both Opening Time and Closing Time.');
        return;
      }
      if (addForm.opens_at === addForm.closes_at) {
        setAddFormError('Opening time and closing time cannot be identical. Please choose different times or enable 24/7 availability.');
        return;
      }
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await apiRequest('/api/locations', {
        method: 'POST',
        body: {
          ...addForm,
          member_capacity: 0
        }
      });
      if (res.success) {
        setIsAddModalOpen(false);
        setFeedback({ type: 'success', message: 'Parking lot registered successfully!' });
        await fetchLocations();
      }
    } catch (err) {
      setAddFormError(err.message || 'Failed to add location');
    } finally {
      setSubmitting(false);
    }
  }

  function openEditModal(loc) {
    setEditForm({
      id: loc.id,
      name: loc.name,
      address: loc.address,
      locality: loc.locality,
      public_capacity: loc.public_capacity,
      is_24_7: Boolean(loc.is_24_7),
      opens_at: loc.opens_at ? loc.opens_at.slice(0, 5) : '',
      closes_at: loc.closes_at ? loc.closes_at.slice(0, 5) : '',
      has_cctv: Boolean(loc.has_cctv),
      has_guard: Boolean(loc.has_guard),
      is_covered: Boolean(loc.is_covered)
    });
    setEditFormError('');
    setIsEditModalOpen(true);
  }

  async function handleUpdateLocation(e) {
    e.preventDefault();
    if (!editForm.id) return;
    setEditFormError('');

    if (!editForm.is_24_7) {
      if (!editForm.opens_at || !editForm.closes_at) {
        setEditFormError('Please provide both Opening Time and Closing Time.');
        return;
      }
      if (editForm.opens_at === editForm.closes_at) {
        setEditFormError('Opening time and closing time cannot be identical. Please choose different times or enable 24/7 availability.');
        return;
      }
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await apiRequest(`/api/locations/${editForm.id}`, {
        method: 'PUT',
        body: {
          name: editForm.name,
          address: editForm.address,
          locality: editForm.locality,
          public_capacity: Number(editForm.public_capacity),
          member_capacity: 0,
          is_24_7: editForm.is_24_7,
          opens_at: editForm.is_24_7 ? null : editForm.opens_at,
          closes_at: editForm.is_24_7 ? null : editForm.closes_at,
          has_cctv: editForm.has_cctv,
          has_guard: editForm.has_guard,
          is_covered: editForm.is_covered
        }
      });
      if (res.success) {
        setIsEditModalOpen(false);
        setFeedback({ type: 'success', message: 'Location details and operating hours updated successfully!' });
        await fetchLocations();
      }
    } catch (err) {
      setEditFormError(err.message || 'Failed to update location');
    } finally {
      setSubmitting(false);
    }
  }

  function openTariffModal(loc) {
    setSelectedLoc(loc);
    setTariffForm({
      hourly_rate: loc.hourly_rate || '',
      daily_rate: loc.daily_rate || '',
      weekly_rate: loc.weekly_rate || '',
      monthly_rate: loc.monthly_rate || '',
      overtime_rate_per_minute: loc.overtime_rate_per_minute || 1.00
    });
    setIsTariffModalOpen(true);
  }

  async function handleUpdateTariff(e) {
    e.preventDefault();
    if (!selectedLoc) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await apiRequest(`/api/locations/${selectedLoc.id}/tariff`, {
        method: 'PUT',
        body: tariffForm
      });
      if (res.success) {
        setIsTariffModalOpen(false);
        setFeedback({ type: 'success', message: `Tariff rates updated for ${selectedLoc.name}` });
        await fetchLocations();
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update tariff' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-warmgrey">
        <div>
          <div className="text-xs text-charcoalMuted mb-1">
            <Link to="/owner/dashboard" className="hover:underline">Dashboard</Link> / My Locations
          </div>
          <h1 className="text-2xl font-black text-charcoal">Private Parking Locations</h1>
          <p className="text-xs text-charcoalMuted mt-1">
            Manage your commercial parking facilities, tariffs, and availability
          </p>
        </div>

        <Button variant="primary" size="md" onClick={() => setIsAddModalOpen(true)}>
          <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          Add New Parking Lot
        </Button>
      </div>

      {feedback && <Alert type={feedback.type} message={feedback.message} />}
      {error && <Alert type="error" message={error} />}

      {/* Locations List */}
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Spinner size="md" />
        </div>
      ) : locations.length === 0 ? (
        <Card className="text-center py-10">
          <p className="text-sm text-charcoalMuted">No parking locations registered yet.</p>
          <Button variant="primary" size="sm" className="mt-4" onClick={() => setIsAddModalOpen(true)}>
            List Your First Parking Space
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {locations.map((loc) => (
            <Card key={loc.id} className="flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-base font-bold text-charcoal leading-snug">{loc.name}</h3>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    loc.is_active ? 'bg-emerald-100 text-emerald-950 border border-emerald-300' : 'bg-stone-200 text-stone-700'
                  }`}>
                    {loc.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-xs text-charcoalMuted">{loc.address}, {loc.locality}</p>

                {/* Capacity */}
                <div className="mt-4 p-3 bg-surfaceSoft border border-warmgrey/80 rounded-md text-xs flex justify-between items-center">
                  <div>
                    <span className="text-charcoalMuted text-[11px] block">Total Bays</span>
                    <span className="font-bold text-charcoal text-base">{loc.public_capacity} spots</span>
                  </div>
                  <div className="text-right">
                    <span className="text-charcoalMuted text-[11px] block">Live Parked</span>
                    <span className="font-bold text-amber-900 text-base">{loc.active_sessions_count || 0} active</span>
                  </div>
                </div>

                {/* Tariffs */}
                <div className="mt-3 text-xs space-y-1 text-charcoal">
                  <div className="flex justify-between">
                    <span className="text-charcoalMuted">Hourly Rate:</span>
                    <span className="font-semibold">₹{loc.hourly_rate || 'N/A'} / hr</span>
                  </div>
                  {loc.daily_rate && (
                    <div className="flex justify-between">
                      <span className="text-charcoalMuted">Daily Rate:</span>
                      <span className="font-semibold">₹{loc.daily_rate} / day</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-charcoalMuted">Operating Hours:</span>
                    <span className="font-semibold flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${loc.is_currently_open ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      <span>{loc.operating_hours || (loc.is_24_7 ? '24/7' : `${loc.opens_at} - ${loc.closes_at}`)}</span>
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-charcoalMuted">Lifetime Bookings:</span>
                    <span className="font-semibold text-charcoal">{loc.total_bookings_count || 0}</span>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="mt-5 pt-3 border-t border-warmgrey/80 flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => openEditModal(loc)}
                >
                  Edit Lot
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => openTariffModal(loc)}
                >
                  Edit Rates
                </Button>
                <Link to="/owner/terminal" className="flex-1">
                  <Button variant="primary" size="sm" className="w-full text-xs">
                    Terminal
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add Location Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Private Parking Location"
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleAddLocation} className="space-y-4">
          <Input
            label="Parking Facility Name"
            value={addForm.name}
            onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
            placeholder="e.g. Katpadi Station Central Parking Bay"
            required
          />

          <Input
            label="Street Address"
            value={addForm.address}
            onChange={(e) => setAddForm({ ...addForm, address: e.target.value })}
            placeholder="e.g. 14 Gandhi Nagar Main Road"
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Locality / Landmark"
              value={addForm.locality}
              onChange={(e) => setAddForm({ ...addForm, locality: e.target.value })}
              required
            />
            <Input
              label="Total Parking Capacity"
              type="number"
              min="1"
              value={addForm.public_capacity}
              onChange={(e) => setAddForm({ ...addForm, public_capacity: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Hourly Rate (₹)"
              type="number"
              min="0"
              value={addForm.hourly_rate}
              onChange={(e) => setAddForm({ ...addForm, hourly_rate: e.target.value })}
              required
            />
            <Input
              label="Daily Rate (₹)"
              type="number"
              min="0"
              value={addForm.daily_rate}
              onChange={(e) => setAddForm({ ...addForm, daily_rate: e.target.value })}
            />
          </div>

          {/* Operating Hours Configuration */}
          <div className="p-3 bg-surfaceSoft border border-warmgrey rounded-md space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-bold text-charcoal cursor-pointer">
                <input
                  type="checkbox"
                  checked={addForm.is_24_7}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setAddForm({
                      ...addForm,
                      is_24_7: checked,
                      opens_at: checked ? '' : addForm.opens_at,
                      closes_at: checked ? '' : addForm.closes_at
                    });
                    setAddFormError('');
                  }}
                  className="rounded text-amber-500 focus:ring-amber-400"
                />
                Open 24/7 round the clock
              </label>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${addForm.is_24_7 ? 'bg-emerald-100 text-emerald-950' : 'bg-amber-100 text-amber-950'}`}>
                {addForm.is_24_7 ? '24 Hours' : 'Custom Hours'}
              </span>
            </div>

            {!addForm.is_24_7 && (
              <div className="pt-2 border-t border-warmgrey/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-charcoal">
                    Facility Operating Hours
                  </span>
                  <span className="text-[10px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-200">
                    Required when not 24/7
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-charcoal mb-1">
                      Opening Time <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="time"
                      value={addForm.opens_at}
                      onChange={(e) => {
                        setAddForm({ ...addForm, opens_at: e.target.value });
                        setAddFormError('');
                      }}
                      required={!addForm.is_24_7}
                      className="w-full text-xs font-semibold px-3 py-2 border border-warmgrey rounded bg-surface focus:ring-1 focus:ring-amber-500"
                    />
                    <span className="text-[10px] text-charcoalMuted mt-0.5 block">
                      e.g. 06:00 AM (or 06:00 PM for overnight)
                    </span>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-charcoal mb-1">
                      Closing Time <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="time"
                      value={addForm.closes_at}
                      onChange={(e) => {
                        setAddForm({ ...addForm, closes_at: e.target.value });
                        setAddFormError('');
                      }}
                      required={!addForm.is_24_7}
                      className="w-full text-xs font-semibold px-3 py-2 border border-warmgrey rounded bg-surface focus:ring-1 focus:ring-amber-500"
                    />
                    <span className="text-[10px] text-charcoalMuted mt-0.5 block">
                      e.g. 10:00 PM (or 02:00 AM next day)
                    </span>
                  </div>
                </div>
                {addFormError && (
                  <p className="text-xs text-rose-600 font-semibold">{addFormError}</p>
                )}
                <p className="text-[11px] text-charcoalMuted">
                  Normal daytime schedules (e.g. 06:00 AM to 10:00 PM) and overnight schedules (e.g. 06:00 PM to 02:00 AM) are supported.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 pt-1">
            <label className="flex items-center gap-1.5 text-xs text-charcoal">
              <input
                type="checkbox"
                checked={addForm.has_cctv}
                onChange={(e) => setAddForm({ ...addForm, has_cctv: e.target.checked })}
              />
              CCTV Surveillance
            </label>
            <label className="flex items-center gap-1.5 text-xs text-charcoal">
              <input
                type="checkbox"
                checked={addForm.has_guard}
                onChange={(e) => setAddForm({ ...addForm, has_guard: e.target.checked })}
              />
              Guard on Duty
            </label>
            <label className="flex items-center gap-1.5 text-xs text-charcoal">
              <input
                type="checkbox"
                checked={addForm.is_covered}
                onChange={(e) => setAddForm({ ...addForm, is_covered: e.target.checked })}
              />
              Covered Parking
            </label>
          </div>

          <div className="pt-3 flex justify-end gap-2 border-t border-warmgrey">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsAddModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={submitting}
            >
              Save Parking Lot
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Location Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Parking Location & Operating Hours"
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleUpdateLocation} className="space-y-4">
          <Input
            label="Parking Facility Name"
            value={editForm.name}
            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            required
          />

          <Input
            label="Street Address"
            value={editForm.address}
            onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Locality / Landmark"
              value={editForm.locality}
              onChange={(e) => setEditForm({ ...editForm, locality: e.target.value })}
              required
            />
            <Input
              label="Total Parking Capacity"
              type="number"
              min="1"
              value={editForm.public_capacity}
              onChange={(e) => setEditForm({ ...editForm, public_capacity: e.target.value })}
              required
            />
          </div>

          {/* Operating Hours Configuration */}
          <div className="p-3 bg-surfaceSoft border border-warmgrey rounded-md space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-bold text-charcoal cursor-pointer">
                <input
                  type="checkbox"
                  checked={editForm.is_24_7}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setEditForm({
                      ...editForm,
                      is_24_7: checked,
                      opens_at: checked ? '' : editForm.opens_at,
                      closes_at: checked ? '' : editForm.closes_at
                    });
                    setEditFormError('');
                  }}
                  className="rounded text-amber-500 focus:ring-amber-400"
                />
                Open 24/7 round the clock
              </label>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${editForm.is_24_7 ? 'bg-emerald-100 text-emerald-950' : 'bg-amber-100 text-amber-950'}`}>
                {editForm.is_24_7 ? '24 Hours' : 'Custom Hours'}
              </span>
            </div>

            {!editForm.is_24_7 && (
              <div className="pt-2 border-t border-warmgrey/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-charcoal">
                    Facility Operating Hours
                  </span>
                  <span className="text-[10px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-200">
                    Required when not 24/7
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-charcoal mb-1">
                      Opening Time <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="time"
                      value={editForm.opens_at}
                      onChange={(e) => {
                        setEditForm({ ...editForm, opens_at: e.target.value });
                        setEditFormError('');
                      }}
                      required={!editForm.is_24_7}
                      className="w-full text-xs font-semibold px-3 py-2 border border-warmgrey rounded bg-surface focus:ring-1 focus:ring-amber-500"
                    />
                    <span className="text-[10px] text-charcoalMuted mt-0.5 block">
                      e.g. 06:00 AM (or 06:00 PM for overnight)
                    </span>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-charcoal mb-1">
                      Closing Time <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="time"
                      value={editForm.closes_at}
                      onChange={(e) => {
                        setEditForm({ ...editForm, closes_at: e.target.value });
                        setEditFormError('');
                      }}
                      required={!editForm.is_24_7}
                      className="w-full text-xs font-semibold px-3 py-2 border border-warmgrey rounded bg-surface focus:ring-1 focus:ring-amber-500"
                    />
                    <span className="text-[10px] text-charcoalMuted mt-0.5 block">
                      e.g. 10:00 PM (or 02:00 AM next day)
                    </span>
                  </div>
                </div>
                {editFormError && (
                  <p className="text-xs text-rose-600 font-semibold">{editFormError}</p>
                )}
                <p className="text-[11px] text-charcoalMuted">
                  Normal daytime schedules (e.g. 06:00 AM to 10:00 PM) and overnight schedules (e.g. 06:00 PM to 02:00 AM) are supported.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 pt-1">
            <label className="flex items-center gap-1.5 text-xs text-charcoal">
              <input
                type="checkbox"
                checked={editForm.has_cctv}
                onChange={(e) => setEditForm({ ...editForm, has_cctv: e.target.checked })}
              />
              CCTV Surveillance
            </label>
            <label className="flex items-center gap-1.5 text-xs text-charcoal">
              <input
                type="checkbox"
                checked={editForm.has_guard}
                onChange={(e) => setEditForm({ ...editForm, has_guard: e.target.checked })}
              />
              Guard on Duty
            </label>
            <label className="flex items-center gap-1.5 text-xs text-charcoal">
              <input
                type="checkbox"
                checked={editForm.is_covered}
                onChange={(e) => setEditForm({ ...editForm, is_covered: e.target.checked })}
              />
              Covered Parking
            </label>
          </div>

          <div className="pt-3 flex justify-end gap-2 border-t border-warmgrey">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsEditModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={submitting}
            >
              Update Location
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Tariff Modal */}
      <Modal
        isOpen={isTariffModalOpen}
        onClose={() => setIsTariffModalOpen(false)}
        title={`Update Tariffs: ${selectedLoc?.name || ''}`}
      >
        <form onSubmit={handleUpdateTariff} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Hourly Rate (₹)"
              type="number"
              value={tariffForm.hourly_rate}
              onChange={(e) => setTariffForm({ ...tariffForm, hourly_rate: e.target.value })}
            />
            <Input
              label="Daily Rate (₹)"
              type="number"
              value={tariffForm.daily_rate}
              onChange={(e) => setTariffForm({ ...tariffForm, daily_rate: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Weekly Rate (₹)"
              type="number"
              value={tariffForm.weekly_rate}
              onChange={(e) => setTariffForm({ ...tariffForm, weekly_rate: e.target.value })}
            />
            <Input
              label="Monthly Rate (₹)"
              type="number"
              value={tariffForm.monthly_rate}
              onChange={(e) => setTariffForm({ ...tariffForm, monthly_rate: e.target.value })}
            />
          </div>
          <Input
            label="Overtime Rate (₹ / min)"
            type="number"
            step="0.1"
            value={tariffForm.overtime_rate_per_minute}
            onChange={(e) => setTariffForm({ ...tariffForm, overtime_rate_per_minute: e.target.value })}
            helperText="Charged if vehicle remains past reserved reservation end time"
          />

          <div className="pt-3 flex justify-end gap-2 border-t border-warmgrey">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsTariffModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={submitting}
            >
              Save Tariffs
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default OwnerLocationsPage;
