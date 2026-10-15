import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Alert } from '../components/Alert';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [role, setRole] = useState('customer');
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    confirm_password: '',
    org_name: '',
    org_identifier: '',
    business_name: ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirm_password) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        role,
        full_name: formData.full_name,
        email: formData.email,
        phone: formData.phone || null,
        password: formData.password
      };

      if (role === 'org_admin') {
        payload.org_name = formData.org_name;
        payload.org_identifier = formData.org_identifier;
      } else if (role === 'owner') {
        payload.business_name = formData.business_name;
      }

      const res = await register(payload);

      if (role === 'customer') {
        navigate('/customer/dashboard');
      } else if (role === 'org_admin') {
        if (res.org?.approval_status === 'approved') {
          navigate('/org/dashboard');
        } else {
          navigate('/awaiting-approval');
        }
      } else if (role === 'owner') {
        if (res.ownerProfile?.approval_status === 'approved') {
          navigate('/owner/dashboard');
        } else {
          navigate('/awaiting-approval');
        }
      }
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-10 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <div className="inline-flex w-12 h-12 rounded-lg bg-accent border border-yellow-500 items-center justify-center font-black text-xl text-charcoal shadow-sm mb-3">
            P
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-charcoal">Create your ParkHere account</h2>
          <p className="text-xs text-charcoalMuted mt-1">
            Join the smart parking management and reservation network
          </p>
        </div>

        <Card>
          {error && <Alert type="error" message={error} className="mb-4" />}

          <div className="mb-5">
            <label className="block text-xs font-semibold text-charcoal mb-2">
              Select Account Type <span className="text-rose-600">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setRole('customer')}
                className={`py-2 px-3 text-xs font-semibold rounded border text-center transition-all ${
                  role === 'customer'
                    ? 'bg-accent/40 border-amber-400 text-charcoal shadow-xs font-bold'
                    : 'bg-surface border-warmgrey text-charcoalMuted hover:bg-stone-50'
                }`}
              >
                Customer / Driver
              </button>
              <button
                type="button"
                onClick={() => setRole('org_admin')}
                className={`py-2 px-3 text-xs font-semibold rounded border text-center transition-all ${
                  role === 'org_admin'
                    ? 'bg-accent/40 border-amber-400 text-charcoal shadow-xs font-bold'
                    : 'bg-surface border-warmgrey text-charcoalMuted hover:bg-stone-50'
                }`}
              >
                Organization Admin
              </button>
              <button
                type="button"
                onClick={() => setRole('owner')}
                className={`py-2 px-3 text-xs font-semibold rounded border text-center transition-all ${
                  role === 'owner'
                    ? 'bg-accent/40 border-amber-400 text-charcoal shadow-xs font-bold'
                    : 'bg-surface border-warmgrey text-charcoalMuted hover:bg-stone-50'
                }`}
              >
                Private Lot Owner
              </button>
            </div>
            <p className="text-[11px] text-charcoalMuted mt-1.5">
              {role === 'customer' && 'Reserve parking spaces, claim institution discounts, and manage gate entry.'}
              {role === 'org_admin' && 'Manage organization parking facilities, member directories, and verify member entry.'}
              {role === 'owner' && 'Monetize private parking lots, configure tariffs, and admit vehicles at gates.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Full Name"
              name="full_name"
              value={formData.full_name}
              onChange={handleChange}
              placeholder="e.g. John Doe"
              required
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Email Address"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="name@example.com"
                required
              />
              <Input
                label="Phone Number"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleChange}
                placeholder="10-digit mobile"
              />
            </div>

            {role === 'org_admin' && (
              <div className="p-3.5 bg-surfaceSoft border border-warmgrey rounded-md space-y-3">
                <div className="text-xs font-bold text-charcoal uppercase tracking-wider">
                  Organization Details (Requires Admin Approval)
                </div>
                <Input
                  label="Organization Name"
                  name="org_name"
                  value={formData.org_name}
                  onChange={handleChange}
                  placeholder="e.g. Metro Park Corp, City University"
                  required
                />
                <Input
                  label="Organization Code / Acronym"
                  name="org_identifier"
                  value={formData.org_identifier}
                  onChange={handleChange}
                  placeholder="e.g. METRO"
                  helperText="Short uppercase code used by members during ID verification"
                  required
                />
              </div>
            )}

            {role === 'owner' && (
              <div className="p-3.5 bg-surfaceSoft border border-warmgrey rounded-md space-y-3">
                <div className="text-xs font-bold text-charcoal uppercase tracking-wider">
                  Business Entity Details (Requires Admin Approval)
                </div>
                <Input
                  label="Business / Trade Name"
                  name="business_name"
                  value={formData.business_name}
                  onChange={handleChange}
                  placeholder="e.g. Katpadi Central Parking & Logistics"
                  required
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Password"
                name="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Min 8 characters"
                required
              />
              <Input
                label="Confirm Password"
                name="confirm_password"
                type="password"
                value={formData.confirm_password}
                onChange={handleChange}
                placeholder="Re-enter password"
                required
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={loading}
              className="w-full mt-2 font-semibold"
            >
              Complete Registration
            </Button>
          </form>

          <div className="mt-5 pt-4 border-t border-warmgrey/60 text-center">
            <span className="text-xs text-charcoalMuted">Already have an account? </span>
            <Link to="/login" className="text-xs font-bold text-charcoal hover:underline">
              Sign In here
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default RegisterPage;
