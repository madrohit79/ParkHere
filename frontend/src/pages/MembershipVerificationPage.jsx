import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Badge } from '../components/Badge';
import { Alert } from '../components/Alert';
import { Spinner } from '../components/Spinner';

export function MembershipVerificationPage() {
  const [orgIdentifier, setOrgIdentifier] = useState('');
  const [memberIdentifier, setMemberIdentifier] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');

  const [memberships, setMemberships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  async function loadMemberships() {
    try {
      const res = await apiRequest('/api/membership/status');
      if (res.success && Array.isArray(res.data)) {
        setMemberships(res.data);
      }
    } catch (err) {
      console.error('Failed to load memberships:', err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMemberships();
  }, []);

  async function handleVerify(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const res = await apiRequest('/api/membership/verify', {
        method: 'POST',
        body: {
          org_identifier: orgIdentifier.trim(),
          member_identifier: memberIdentifier.trim(),
          full_name: fullName.trim(),
          email: email.trim()
        }
      });

      if (res.success) {
        setMessage(`Success! Verified membership with ${res.data.org_name} (${res.data.parking_benefit} benefit).`);
        setOrgIdentifier('');
        setMemberIdentifier('');
        setFullName('');
        setEmail('');
        await loadMemberships();
      }
    } catch (err) {
      setError(err.message || 'Verification failed');
    } finally {
      setSubmitting(false);
    }
  }

  function handleQuickFillDemo(id, name, mail) {
    setOrgIdentifier('DEMO-ORG');
    setMemberIdentifier(id);
    setFullName(name);
    setEmail(mail);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 text-left">
      <div>
        <h1 className="text-2xl font-black text-charcoal tracking-tight">Organisation Membership Verification</h1>
        <p className="text-sm text-charcoalMuted mt-1">
          Verify your employee or student membership against approved organisations to unlock reserved member parking pools and tariff discounts.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Verification Form */}
        <Card title="Verify New Membership" subtitle="All 4 fields are matched against active org records">
          <form onSubmit={handleVerify} className="space-y-4">
            {message && <Alert type="success" message={message} />}
            {error && <Alert type="error" message={error} />}

            <Input
              label="Organisation Identifier"
              placeholder="e.g. DEMO-ORG"
              value={orgIdentifier}
              onChange={(e) => setOrgIdentifier(e.target.value)}
              required
            />

            <Input
              label="Member ID / Roll Number"
              placeholder="e.g. MEM-001"
              value={memberIdentifier}
              onChange={(e) => setMemberIdentifier(e.target.value)}
              required
            />

            <Input
              label="Member Full Name"
              placeholder="As registered in organisation directory"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />

            <Input
              label="Member Email Address"
              type="email"
              placeholder="Registered organisation email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <div className="pt-2">
              <Button type="submit" variant="primary" loading={submitting} className="w-full font-bold">
                Verify Membership
              </Button>
            </div>
          </form>
        </Card>

        {/* Existing verified memberships */}
        <div className="space-y-4">
          <Card title="Your Verified Memberships" subtitle="Linked to this customer account">
            {loading ? (
              <Spinner />
            ) : memberships.length === 0 ? (
              <p className="text-xs text-charcoalMuted">You have not verified any organisation memberships yet.</p>
            ) : (
              <div className="space-y-3">
                {memberships.map((m) => (
                  <div key={m.membership_id} className="p-3 rounded-lg bg-surfaceSoft border border-warmgrey space-y-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-charcoal">{m.org_name}</h4>
                      <Badge variant="verified" label={m.parking_benefit.toUpperCase()} />
                    </div>
                    <div className="text-xs text-charcoalMuted">
                      Identifier: <span className="font-mono font-medium">{m.member_identifier}</span> ({m.org_identifier})
                    </div>
                    <div className="text-[11px] text-charcoalMuted">
                      Verified on: {new Date(m.verified_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="How Membership Verification Works" className="bg-amber-50/40">
            <ul className="text-xs text-charcoalLight space-y-2 list-disc list-inside">
              <li>Organisations maintain approved member rosters.</li>
              <li>Exact match on Member ID, full name, and registered email address is required.</li>
              <li>Single-use linking prevents unauthorized duplicate claims.</li>
              <li>Verified members automatically receive dedicated spots and discounted parking rates.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default MembershipVerificationPage;
