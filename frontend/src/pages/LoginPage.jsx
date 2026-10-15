import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Alert } from '../components/Alert';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const data = await login(email.trim(), password);

      // Route based on role & approval status
      const user = data.user;
      if (user.role === 'platform_admin') {
        navigate('/admin/dashboard');
      } else if (user.role === 'org_admin') {
        if (data.org?.approval_status === 'approved') {
          navigate('/org/dashboard');
        } else {
          navigate('/awaiting-approval');
        }
      } else if (user.role === 'owner') {
        if (data.ownerProfile?.approval_status === 'approved') {
          navigate('/owner/dashboard');
        } else {
          navigate('/awaiting-approval');
        }
      } else {
        const returnUrl = location.state?.returnUrl || '/customer/dashboard';
        navigate(returnUrl);
      }
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(demoEmail) {
    setEmail(demoEmail);
    setPassword('Password123!');
  }

  return (
    <div className="max-w-md mx-auto px-4 py-12 text-left">
      <Card title="Sign in to ParkHere" subtitle="Access your reservations or provider terminal">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert type="error" message={error} />}

          <Input
            label="Email Address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            required
          />

          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />

          <Button type="submit" variant="primary" loading={loading} className="w-full font-bold">
            Sign In
          </Button>

          <p className="text-xs text-center text-charcoalMuted pt-2">
            Don't have an account?{' '}
            <Link to="/register" className="font-bold text-charcoal hover:underline">
              Create an account
            </Link>
          </p>
        </form>

        {/* Viva Demo Quick Sign-in Section */}
        <div className="mt-6 pt-4 border-t border-warmgrey">
          <div className="text-[11px] font-bold text-charcoal uppercase tracking-wider mb-2">
            Evaluation / Viva Demo Quick Sign-in
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => fillDemo('admin@parkhere.local')}
              className="p-1.5 rounded bg-cream hover:bg-amber-100 border border-warmgrey text-left"
            >
              <div className="font-bold">Platform Admin</div>
              <div className="text-[10px] text-charcoalMuted">admin@parkhere.local</div>
            </button>

            <button
              type="button"
              onClick={() => fillDemo('orgadmin@parkhere.local')}
              className="p-1.5 rounded bg-cream hover:bg-amber-100 border border-warmgrey text-left"
            >
              <div className="font-bold">Org Admin</div>
              <div className="text-[10px] text-charcoalMuted">orgadmin@parkhere.local</div>
            </button>

            <button
              type="button"
              onClick={() => fillDemo('owner1@parkhere.local')}
              className="p-1.5 rounded bg-cream hover:bg-amber-100 border border-warmgrey text-left"
            >
              <div className="font-bold">Private Owner</div>
              <div className="text-[10px] text-charcoalMuted">owner1@parkhere.local</div>
            </button>

            <button
              type="button"
              onClick={() => fillDemo('customer1@parkhere.local')}
              className="p-1.5 rounded bg-cream hover:bg-amber-100 border border-warmgrey text-left"
            >
              <div className="font-bold">Member Customer</div>
              <div className="text-[10px] text-charcoalMuted">customer1@parkhere.local</div>
            </button>
          </div>
          <div className="text-[10px] text-charcoalMuted text-center mt-2">
            Demo Password for all: <code className="bg-stone-100 px-1 py-0.5 rounded font-mono font-bold">Password123!</code>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default LoginPage;
