import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api/client';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Spinner } from '../components/Spinner';
import { Alert } from '../components/Alert';
import { Badge } from '../components/Badge';
import { Countdown } from '../components/Countdown';

export function GateTerminalPage() {
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'active' | 'completed'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState(null);

  // Data lists
  const [pendingList, setPendingList] = useState([]);
  const [activeList, setActiveList] = useState([]);
  const [completedList, setCompletedList] = useState([]);

  // Gate code state for pending arrivals: bookingId -> { spot_label: '', loading: false, generatedCode: null, deadline: null, error: '' }
  const [gateCodeState, setGateCodeState] = useState({});

  // Exit Modal state
  const [exitModalOpen, setExitModalOpen] = useState(false);
  const [exitData, setExitData] = useState(null);
  const [exitingId, setExitingId] = useState(null);

  useEffect(() => {
    fetchTerminalData();
    const interval = setInterval(fetchTerminalData, 15000); // Poll every 15s
    return () => clearInterval(interval);
  }, [activeTab]);

  async function fetchTerminalData() {
    try {
      if (activeTab === 'pending') {
        const res = await apiRequest('/api/bookings/operator/pending');
        if (res.success) setPendingList(res.data || []);
      } else if (activeTab === 'active') {
        const res = await apiRequest('/api/bookings/operator/active');
        if (res.success) setActiveList(res.data || []);
      } else if (activeTab === 'completed') {
        const res = await apiRequest('/api/bookings/operator/completed');
        if (res.success) setCompletedList(res.data || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to sync terminal data');
    } finally {
      setLoading(false);
    }
  }

  function handleSpotChange(bookingId, spot) {
    setGateCodeState((prev) => ({
      ...prev,
      [bookingId]: {
        ...(prev[bookingId] || {}),
        spot_label: spot
      }
    }));
  }

  async function handleGenerateCode(booking) {
    const state = gateCodeState[booking.id] || {};
    const spot_label = state.spot_label !== undefined ? state.spot_label : (booking.assigned_spot || 'Bay-General');

    setGateCodeState((prev) => ({
      ...prev,
      [booking.id]: { ...state, loading: true, error: '' }
    }));
    setFeedback(null);

    try {
      const res = await apiRequest(`/api/bookings/${booking.id}/generate-code`, {
        method: 'POST',
        body: { spot_label }
      });

      if (res.success) {
        setGateCodeState((prev) => ({
          ...prev,
          [booking.id]: {
            ...state,
            loading: false,
            generatedCode: res.data.gate_code,
            deadline: res.data.arrival_deadline,
            spot_label: res.data.assigned_spot,
            error: ''
          }
        }));
        setFeedback({
          type: 'success',
          message: `Gate Entry Code for vehicle ${booking.vehicle_number} generated: ${res.data.gate_code} (Assigned: ${res.data.assigned_spot}). Driver can now enter this code in their portal.`
        });
        await fetchTerminalData();
      }
    } catch (err) {
      setGateCodeState((prev) => ({
        ...prev,
        [booking.id]: {
          ...state,
          loading: false,
          error: err.message || 'Failed to generate gate code'
        }
      }));
    }
  }

  async function handleRecordExit(bookingId) {
    setExitingId(bookingId);
    setFeedback(null);
    try {
      const res = await apiRequest(`/api/bookings/${bookingId}/exit`, {
        method: 'POST'
      });

      if (res.success) {
        setExitData(res.data);
        setExitModalOpen(true);
        await fetchTerminalData();
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to record vehicle exit' });
    } finally {
      setExitingId(null);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Terminal Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-warmgrey">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-charcoal">Gate Operator Terminal</h1>
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-950 border border-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
              Live Gate Sync
            </span>
          </div>
          <p className="text-xs text-charcoalMuted mt-1">
            Gate admission PIN verification, spot allocation, and automated exit checkout
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => { setLoading(true); fetchTerminalData(); }}>
            <svg className="w-3.5 h-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh List
          </Button>
        </div>
      </div>

      {feedback && <Alert type={feedback.type} message={feedback.message} />}
      {error && <Alert type="error" message={error} />}

      {/* Tabs */}
      <div className="flex border-b border-warmgrey">
        <button
          type="button"
          onClick={() => { setActiveTab('pending'); setLoading(true); }}
          className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'pending'
              ? 'border-amber-500 text-charcoal bg-amber-50/50'
              : 'border-transparent text-charcoalMuted hover:text-charcoal'
          }`}
        >
          <span>Pending Gate Arrivals</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-200 text-amber-900 font-extrabold">
            {pendingList.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab('active'); setLoading(true); }}
          className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'active'
              ? 'border-amber-500 text-charcoal bg-amber-50/50'
              : 'border-transparent text-charcoalMuted hover:text-charcoal'
          }`}
        >
          <span>Active Parked Vehicles</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-200 text-emerald-900 font-extrabold">
            {activeList.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab('completed'); setLoading(true); }}
          className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'completed'
              ? 'border-amber-500 text-charcoal bg-amber-50/50'
              : 'border-transparent text-charcoalMuted hover:text-charcoal'
          }`}
        >
          <span>Completed History</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-stone-200 text-stone-800 font-extrabold">
            {completedList.length}
          </span>
        </button>
      </div>

      {/* TAB 1: Pending Arrivals */}
      {activeTab === 'pending' && (
        <div>
          {loading ? (
            <div className="flex justify-center py-12"><Spinner size="md" /></div>
          ) : pendingList.length === 0 ? (
            <Card className="text-center py-12">
              <p className="text-sm font-medium text-charcoalMuted">No vehicles currently approaching the gate.</p>
              <p className="text-xs text-stone-400 mt-1">Pending bookings within their 15-minute arrival window will appear here automatically.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pendingList.map((b) => {
                const state = gateCodeState[b.id] || {};
                const activeCode = state.generatedCode || b.current_code;
                const assignedSpot = state.spot_label !== undefined ? state.spot_label : (b.assigned_spot || '');
                const attemptsLeft = 5 - (b.failed_attempts || 0);

                return (
                  <Card key={b.id} className="border-l-4 border-l-amber-500">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] font-mono font-bold uppercase text-charcoalMuted block">
                          REF: {b.booking_reference}
                        </span>
                        <div className="text-sm font-bold text-charcoal mt-0.5">{b.location_name}</div>
                      </div>
                      <Countdown
                        targetTime={state.deadline || b.arrival_deadline}
                        label="Arrival Deadline"
                        onExpire={fetchTerminalData}
                      />
                    </div>

                    <div className="mt-4 p-3 bg-surfaceSoft border border-warmgrey/70 rounded-md grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-charcoalMuted text-[11px] block">Vehicle Plate</span>
                        <span className="font-mono font-bold text-sm text-charcoal px-2 py-0.5 bg-yellow-100 rounded border border-yellow-300 inline-block mt-0.5">
                          {b.vehicle_number}
                        </span>
                      </div>
                      <div>
                        <span className="text-charcoalMuted text-[11px] block">Driver</span>
                        <span className="font-semibold text-charcoal block mt-0.5">{b.customer_name}</span>
                        {b.customer_phone && <span className="text-[11px] text-charcoalMuted">{b.customer_phone}</span>}
                      </div>
                    </div>

                    {b.failed_attempts > 0 && (
                      <div className="mt-2 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2.5 py-1 rounded border border-rose-200">
                        Warning: {b.failed_attempts} invalid code attempts entered by driver ({attemptsLeft} remaining before lock)
                      </div>
                    )}

                    {/* Operator Gate Code Section */}
                    {activeCode ? (
                      <div className="mt-4 pt-3 border-t border-warmgrey/80 space-y-3">
                        <div className="p-4 bg-amber-50/80 border-2 border-amber-300 rounded-lg text-center">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 block mb-1">
                            Issued Gate Entry Code
                          </span>
                          <div className="text-3xl font-black font-mono tracking-widest text-charcoal bg-white py-2 px-4 rounded border border-amber-200 inline-block shadow-sm">
                            {activeCode}
                          </div>
                          <div className="text-xs text-amber-900 font-medium mt-2">
                            Assigned Spot: <strong className="text-charcoal">{b.assigned_spot || assignedSpot || 'Bay-General'}</strong>
                          </div>
                          <p className="text-[11px] text-charcoalMuted mt-1">
                            Code communicated to driver. The driver will enter this code on their device to unlock the gate.
                          </p>
                        </div>

                        {/* Replacement Code generation */}
                        <div className="p-3 bg-stone-50 border border-warmgrey/70 rounded-md space-y-2">
                          <label className="text-[11px] font-bold text-charcoal block">
                            Reassign Spot / Replacement Code
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="e.g. Bay-A4"
                              value={assignedSpot}
                              onChange={(e) => handleSpotChange(b.id, e.target.value)}
                              className="flex-1 text-xs font-semibold px-2 py-1.5 border border-warmgrey rounded bg-surface focus:ring-1 focus:ring-amber-500"
                            />
                            <Button
                              variant="secondary"
                              size="sm"
                              className="whitespace-nowrap font-bold"
                              loading={state.loading}
                              onClick={() => handleGenerateCode(b)}
                            >
                              Generate Replacement Code
                            </Button>
                          </div>
                        </div>

                        {state.error && (
                          <p className="text-xs text-rose-600 font-semibold">{state.error}</p>
                        )}
                      </div>
                    ) : (
                      <div className="mt-4 pt-3 border-t border-warmgrey/80 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-charcoal">Gate Entry Code:</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            Awaiting Code Generation
                          </span>
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-charcoal block mb-1">
                            Assign Parking Spot
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Bay-A4 (default: Bay-General)"
                            value={assignedSpot}
                            onChange={(e) => handleSpotChange(b.id, e.target.value)}
                            className="w-full text-xs font-semibold px-2.5 py-1.5 border border-warmgrey rounded bg-surface focus:ring-1 focus:ring-amber-500"
                          />
                        </div>

                        {state.error && (
                          <p className="text-xs text-rose-600 font-semibold">{state.error}</p>
                        )}

                        <Button
                          variant="primary"
                          size="sm"
                          className="w-full font-bold"
                          loading={state.loading}
                          onClick={() => handleGenerateCode(b)}
                        >
                          Generate Gate Entry Code
                        </Button>
                        <p className="text-[10px] text-center text-charcoalMuted">
                          Click to generate single-use 6-digit entry code and activate driver arrival window.
                        </p>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Active Sessions */}
      {activeTab === 'active' && (
        <div>
          {loading ? (
            <div className="flex justify-center py-12"><Spinner size="md" /></div>
          ) : activeList.length === 0 ? (
            <Card className="text-center py-12">
              <p className="text-sm font-medium text-charcoalMuted">No vehicles currently inside this lot.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeList.map((s) => {
                const entryDate = new Date(s.entry_time);
                const endDate = new Date(s.end_time);
                const isOvertime = new Date() > endDate;

                return (
                  <Card key={s.session_id} className={`border-l-4 ${isOvertime ? 'border-l-rose-500' : 'border-l-emerald-500'}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] font-mono font-bold text-charcoalMuted block">
                          REF: {s.booking_reference}
                        </span>
                        <div className="text-sm font-bold text-charcoal mt-0.5">{s.location_name}</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        isOvertime ? 'bg-rose-100 text-rose-950 border border-rose-300' : 'bg-emerald-100 text-emerald-950 border border-emerald-300'
                      }`}>
                        {isOvertime ? 'Overtime Active' : 'Parked'}
                      </span>
                    </div>

                    <div className="mt-4 p-3 bg-surfaceSoft border border-warmgrey/70 rounded-md space-y-2 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-charcoalMuted text-[11px]">Vehicle:</span>
                        <span className="font-mono font-bold text-charcoal px-2 py-0.5 bg-yellow-100 rounded border border-yellow-300">
                          {s.vehicle_number}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-charcoalMuted text-[11px]">Spot Assigned:</span>
                        <span className="font-bold text-charcoal">{s.spot_label || 'General'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-charcoalMuted text-[11px]">Entry Recorded:</span>
                        <span className="font-semibold">{entryDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-charcoalMuted text-[11px]">Scheduled Exit:</span>
                        <span className={`font-semibold ${isOvertime ? 'text-rose-700 font-bold' : ''}`}>
                          {endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>

                    {isOvertime && (
                      <p className="mt-2 text-[11px] text-rose-700 font-semibold bg-rose-50 px-2.5 py-1 rounded border border-rose-200">
                        Overtime rate: ₹{s.overtime_rate_snapshot || 1}/min applying
                      </p>
                    )}

                    <div className="mt-4 pt-3 border-t border-warmgrey/80">
                      <Button
                        variant={isOvertime ? 'danger' : 'primary'}
                        size="sm"
                        className="w-full font-bold"
                        loading={exitingId === s.booking_id}
                        onClick={() => handleRecordExit(s.booking_id)}
                      >
                        Record Exit & Checkout
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Completed History */}
      {activeTab === 'completed' && (
        <div>
          {loading ? (
            <div className="flex justify-center py-12"><Spinner size="md" /></div>
          ) : completedList.length === 0 ? (
            <Card className="text-center py-12">
              <p className="text-sm font-medium text-charcoalMuted">No completed departures recorded yet.</p>
            </Card>
          ) : (
            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surfaceSoft border-b border-warmgrey font-bold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="px-4 py-3">Booking Ref</th>
                      <th className="px-4 py-3">Vehicle</th>
                      <th className="px-4 py-3">Driver</th>
                      <th className="px-4 py-3">Duration</th>
                      <th className="px-4 py-3">Base Bill</th>
                      <th className="px-4 py-3">Overtime</th>
                      <th className="px-4 py-3">Total Charged</th>
                      <th className="px-4 py-3">Payment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warmgrey/60">
                    {completedList.map((c) => (
                      <tr key={c.booking_id} className="hover:bg-cream/40">
                        <td className="px-4 py-3 font-mono font-bold text-charcoal">{c.booking_reference}</td>
                        <td className="px-4 py-3 font-mono font-bold">{c.vehicle_number}</td>
                        <td className="px-4 py-3">{c.customer_name}</td>
                        <td className="px-4 py-3">{c.actual_duration_minutes || '—'} mins</td>
                        <td className="px-4 py-3">₹{c.base_amount}</td>
                        <td className="px-4 py-3">
                          {Number(c.overtime_amount) > 0 ? (
                            <span className="text-rose-700 font-bold">+{c.overtime_minutes}m (₹{c.overtime_amount})</span>
                          ) : (
                            <span className="text-charcoalMuted">₹0.00</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-bold text-charcoal">₹{c.total_amount}</td>
                        <td className="px-4 py-3">
                          <Badge status={c.payment_status || 'paid'} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Exit Summary Receipt Modal */}
      <Modal
        isOpen={exitModalOpen}
        onClose={() => setExitModalOpen(false)}
        title="Vehicle Departure Recorded & Invoice Generated"
      >
        {exitData && (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-lg text-emerald-950 text-xs flex items-center gap-2 font-bold">
              <svg className="w-5 h-5 text-emerald-700 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Exit barrier gate opened. Vehicle departure confirmed.
            </div>

            <div className="p-4 bg-surfaceSoft border border-warmgrey rounded-md space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-charcoalMuted">Actual Duration:</span>
                <span className="font-bold text-charcoal">{exitData.invoice?.actual_duration_minutes} minutes</span>
              </div>
              <div className="flex justify-between">
                <span className="text-charcoalMuted">Base Amount:</span>
                <span className="font-semibold text-charcoal">₹{exitData.invoice?.base_amount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-charcoalMuted">Overtime Duration:</span>
                <span className="font-semibold text-charcoal">{exitData.invoice?.overtime_minutes} minutes</span>
              </div>
              <div className="flex justify-between">
                <span className="text-charcoalMuted">Overtime Surcharge:</span>
                <span className="font-semibold text-rose-700">₹{exitData.invoice?.overtime_amount}</span>
              </div>
              {Number(exitData.invoice?.addons_amount) > 0 && (
                <div className="flex justify-between">
                  <span className="text-charcoalMuted">Facilities / Addons:</span>
                  <span className="font-semibold text-charcoal">₹{exitData.invoice?.addons_amount}</span>
                </div>
              )}
              <div className="pt-2 border-t border-warmgrey flex justify-between text-sm font-black text-charcoal">
                <span>Final Total Due:</span>
                <span>₹{exitData.invoice?.total_amount}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => setExitModalOpen(false)}
              >
                Close Receipt
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default GateTerminalPage;
