import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { Input, Select } from '../components/Input';
import { Alert } from '../components/Alert';
import { Spinner } from '../components/Spinner';

export function BookingFlowModal({ isOpen, onClose, location }) {
  const navigate = useNavigate();

  const [pool, setPool] = useState('public');
  const [vehicleType, setVehicleType] = useState('four_wheeler');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [startChoice, setStartChoice] = useState('now');
  const [customStartTime, setCustomStartTime] = useState('');
  const [rateType, setRateType] = useState('hour');
  const [quantity, setQuantity] = useState(1);
  const [selectedFacilities, setSelectedFacilities] = useState([]);

  const [estimate, setEstimate] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Set default vehicle type on location change
  useEffect(() => {
    if (location?.vehicle_types?.length > 0) {
      setVehicleType(location.vehicle_types[0]);
    }
  }, [location]);

  // Re-estimate on input changes
  useEffect(() => {
    if (!location || !isOpen) return;

    let isMounted = true;
    async function getEstimate() {
      setEstimating(true);
      setError(null);
      try {
        const startTimeVal = startChoice === 'now' 
          ? new Date().toISOString() 
          : (customStartTime ? new Date(customStartTime).toISOString() : new Date().toISOString());

        const res = await apiRequest('/api/bookings/estimate', {
          method: 'POST',
          body: {
            location_id: location.id,
            pool,
            rate_type: rateType,
            quantity: Number(quantity) || 1,
            start_time: startTimeVal,
            facility_codes: selectedFacilities
          }
        });
        if (isMounted && res.success) {
          setEstimate(res.data);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message);
          setEstimate(null);
        }
      } finally {
        if (isMounted) setEstimating(false);
      }
    }

    getEstimate();
    return () => { isMounted = false; };
  }, [location, pool, rateType, quantity, selectedFacilities, startChoice, customStartTime, isOpen]);

  function handleFacilityToggle(code) {
    if (selectedFacilities.includes(code)) {
      setSelectedFacilities(selectedFacilities.filter(c => c !== code));
    } else {
      setSelectedFacilities([...selectedFacilities, code]);
    }
  }

  async function handleConfirmBooking(e) {
    e.preventDefault();
    if (!vehicleNumber.trim()) {
      setError('Please provide a vehicle registration number');
      return;
    }

    if (startChoice === 'later' && !customStartTime) {
      setError('Please select a scheduled arrival date and time');
      return;
    }

    setSubmitting(true);
    setError(null);

    const startTimeVal = startChoice === 'now' ? new Date().toISOString() : new Date(customStartTime).toISOString();

    try {
      const res = await apiRequest('/api/bookings', {
        method: 'POST',
        body: {
          location_id: location.id,
          pool,
          vehicle_type: vehicleType,
          vehicle_number: vehicleNumber.trim().toUpperCase(),
          start_time: startTimeVal,
          rate_type: rateType,
          quantity: Number(quantity),
          facility_codes: selectedFacilities
        }
      });

      if (res.success && res.data) {
        onClose();
        navigate(`/bookings/${res.data.id}`, {
          state: {
            justBooked: true,
            initialCode: res.data.arrival_code
          }
        });
      }
    } catch (err) {
      setError(err.message || 'Failed to create booking reservation');
    } finally {
      setSubmitting(false);
    }
  }

  if (!location) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Reserve Parking - ${location.name}`} maxWidth="max-w-xl">
      <form onSubmit={handleConfirmBooking} className="space-y-4 text-left">
        {error && <Alert type="error" message={error} />}

        {/* Operating Hours Info Banner */}
        {!location.is_24_7 && (
          <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-amber-950">
                <span>Facility Operating Hours:</span>
                <span>{location.operating_hours || `${location.opens_at} - ${location.closes_at}`}</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                location.is_currently_open 
                  ? 'bg-emerald-100 text-emerald-950 border border-emerald-300' 
                  : 'bg-rose-100 text-rose-950 border border-rose-300'
              }`}>
                {location.is_currently_open ? 'Open Now' : 'Closed Now'}
              </span>
            </div>
            <p className="text-[11px] text-amber-900">
              Arrival and departure must fall completely within facility hours. Overnight operating hours are fully supported.
            </p>
          </div>
        )}

        {/* Step 1: Select Pool */}
        {location.member_capacity > 0 && (
          <div className="space-y-1">
            <label className="block text-xs font-bold text-charcoal">Inventory Allocation Pool</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPool('public')}
                className={`px-3 py-2 text-xs font-semibold rounded border text-left transition-colors ${
                  pool === 'public'
                    ? 'bg-amber-100 border-amber-500 text-charcoal'
                    : 'bg-surface border-warmgrey text-charcoal hover:bg-stone-50'
                }`}
              >
                <div>Public Pool</div>
                <div className="text-[10px] text-charcoalMuted font-normal">Open to everyone</div>
              </button>

              <button
                type="button"
                disabled={!location.is_user_verified_member}
                onClick={() => setPool('member')}
                className={`px-3 py-2 text-xs font-semibold rounded border text-left transition-colors ${
                  !location.is_user_verified_member
                    ? 'opacity-50 cursor-not-allowed bg-stone-100 border-warmgrey'
                    : pool === 'member'
                    ? 'bg-blue-100 border-blue-500 text-blue-950'
                    : 'bg-surface border-warmgrey text-charcoal hover:bg-stone-50'
                }`}
              >
                <div>Member Allocation</div>
                <div className="text-[10px] text-charcoalMuted font-normal">
                  {location.is_user_verified_member ? 'Verified benefit applied' : 'Requires verified membership'}
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Vehicle info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Vehicle Type"
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value)}
            required
          >
            {location.vehicle_types?.map((vt) => (
              <option key={vt} value={vt}>
                {vt.replace('_', ' ').toUpperCase()}
              </option>
            ))}
          </Select>

          <Input
            label="Vehicle Registration Number"
            placeholder="e.g. TN23-AB-1234"
            value={vehicleNumber}
            onChange={(e) => setVehicleNumber(e.target.value)}
            required
          />
        </div>

        {/* Step 3: Start Time */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-charcoal">Arrival Time</label>
          <div className="flex gap-4 text-xs font-medium">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="startChoice"
                value="now"
                checked={startChoice === 'now'}
                onChange={() => setStartChoice('now')}
                className="text-amber-600 focus:ring-amber-500"
              />
              <span>Start Now (Immediate entry demo)</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="startChoice"
                value="later"
                checked={startChoice === 'later'}
                onChange={() => setStartChoice('later')}
                className="text-amber-600 focus:ring-amber-500"
              />
              <span>Schedule in Advance (Up to 7 days)</span>
            </label>
          </div>

          {startChoice === 'later' && (
            <Input
              type="datetime-local"
              value={customStartTime}
              onChange={(e) => setCustomStartTime(e.target.value)}
              required
            />
          )}
        </div>

        {/* Step 4: Duration & Rate Type */}
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Pricing Rate Type"
            value={rateType}
            onChange={(e) => setRateType(e.target.value)}
            required
          >
            {location.hourly_rate && <option value="hour">Hourly Rate (₹{location.hourly_rate}/h)</option>}
            {location.daily_rate && <option value="day">Daily Rate (₹{location.daily_rate}/day)</option>}
            {location.weekly_rate && <option value="week">Weekly Rate (₹{location.weekly_rate}/wk)</option>}
            {location.monthly_rate && <option value="month">Monthly Rate (₹{location.monthly_rate}/mo)</option>}
          </Select>

          <Input
            label="Duration Count / Units"
            type="number"
            min="1"
            max="100"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
        </div>

        {/* Step 5: Optional Add-on Facilities */}
        {location.facilities && location.facilities.length > 0 && (
          <div className="space-y-1 pt-1 border-t border-warmgrey">
            <label className="block text-xs font-bold text-charcoal">Optional Facility Add-ons (Flat fee)</label>
            <div className="space-y-1.5">
              {location.facilities.map((f) => (
                <label key={f.code} className="flex items-center justify-between p-2 rounded bg-surfaceSoft border border-warmgrey/70 text-xs cursor-pointer hover:bg-cream/40">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedFacilities.includes(f.code)}
                      onChange={() => handleFacilityToggle(f.code)}
                      className="rounded border-warmgrey text-amber-600 focus:ring-amber-500"
                    />
                    <span className="font-semibold text-charcoal">{f.name}</span>
                  </div>
                  <span className="font-bold text-charcoal">+₹{f.price}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Live Estimate Breakdown Box */}
        <div className="bg-amber-50/70 border border-amber-300 rounded-lg p-3 text-xs space-y-1.5">
          <div className="flex items-center justify-between font-bold text-charcoal border-b border-amber-200/80 pb-1">
            <span>Price Estimate Breakdown</span>
            {estimating && <span className="text-[10px] text-amber-800">Calculating...</span>}
          </div>

          {estimate && (
            <>
              <div className="flex justify-between text-charcoalMuted">
                <span>Base ({estimate.quantity} × ₹{estimate.unit_price}):</span>
                <span>₹{(estimate.unit_price * estimate.quantity).toFixed(2)}</span>
              </div>

              {estimate.benefit_applied === 'discounted' && (
                <div className="flex justify-between text-emerald-800 font-semibold">
                  <span>Member Discount ({estimate.discount_percent}%):</span>
                  <span>-₹{((estimate.unit_price * estimate.quantity) - estimate.base_amount).toFixed(2)}</span>
                </div>
              )}

              {estimate.benefit_applied === 'free' && (
                <div className="flex justify-between text-emerald-800 font-semibold">
                  <span>Member Free Benefit:</span>
                  <span>100% Free</span>
                </div>
              )}

              {estimate.addons_amount > 0 && (
                <div className="flex justify-between text-charcoalMuted">
                  <span>Facility Add-ons:</span>
                  <span>+₹{estimate.addons_amount.toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between text-charcoal font-bold pt-1 border-t border-amber-200 text-sm">
                <span>Total Estimated Amount:</span>
                <span>₹{estimate.total_amount.toFixed(2)}</span>
              </div>
            </>
          )}

          <div className="text-[10px] text-charcoalMuted pt-0.5">
            * Note: Overtime is calculated upon actual gate exit at ₹{location.overtime_rate_per_minute}/min.
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting} className="font-bold">
            Confirm & Reserve Space
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default BookingFlowModal;
