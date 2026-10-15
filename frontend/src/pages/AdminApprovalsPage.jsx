import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Input } from '../components/Input';
import { Spinner } from '../components/Spinner';
import { Alert } from '../components/Alert';

export function AdminApprovalsPage() {
  const [data, setData] = useState({ organisations: [], owners: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState(null);

  // Rejection modal
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null); // { type: 'org' | 'owner', id: 1, name: '...' }
  const [rejectReason, setRejectReason] = useState('Application does not meet platform verification criteria');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchProviders();
  }, []);

  async function fetchProviders() {
    setLoading(true);
    try {
      const res = await apiRequest('/api/admin/providers/pending');
      if (res.success) {
        setData(res.data);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch provider applications');
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(type, id, name) {
    setActionLoading(true);
    setFeedback(null);
    try {
      const endpoint = type === 'org'
        ? `/api/admin/organisations/${id}/approve`
        : `/api/admin/owners/${id}/approve`;

      const res = await apiRequest(endpoint, { method: 'POST' });
      if (res.success) {
        setFeedback({ type: 'success', message: `${name} approved successfully!` });
        await fetchProviders();
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to approve provider' });
    } finally {
      setActionLoading(false);
    }
  }

  function openRejectModal(type, id, name) {
    setRejectTarget({ type, id, name });
    setRejectReason('Application does not meet platform verification criteria');
    setRejectModalOpen(true);
  }

  async function handleConfirmReject(e) {
    e.preventDefault();
    if (!rejectTarget) return;

    setActionLoading(true);
    setFeedback(null);
    try {
      const endpoint = rejectTarget.type === 'org'
        ? `/api/admin/organisations/${rejectTarget.id}/reject`
        : `/api/admin/owners/${rejectTarget.id}/reject`;

      const res = await apiRequest(endpoint, {
        method: 'POST',
        body: { reason: rejectReason }
      });

      if (res.success) {
        setRejectModalOpen(false);
        setFeedback({ type: 'warning', message: `${rejectTarget.name} application has been rejected.` });
        await fetchProviders();
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to reject provider' });
    } finally {
      setActionLoading(false);
    }
  }

  const { organisations = [], owners = [] } = data;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-warmgrey">
        <div>
          <div className="text-xs text-charcoalMuted mb-1">
            <Link to="/admin/dashboard" className="hover:underline">Dashboard</Link> / Provider Approvals
          </div>
          <h1 className="text-2xl font-black text-charcoal">Provider Verification Queue</h1>
          <p className="text-xs text-charcoalMuted mt-1">
            Evaluate and grant listing authority to organisations and private lot owners
          </p>
        </div>

        <Button variant="secondary" size="sm" onClick={fetchProviders}>
          Refresh Queue
        </Button>
      </div>

      {feedback && <Alert type={feedback.type} message={feedback.message} />}
      {error && <Alert type="error" message={error} />}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* SECTION 1: Organisations */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-charcoal flex items-center gap-2">
                <span>Organisation Providers</span>
                <span className="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-900 border border-amber-300 font-extrabold">
                  {organisations.length}
                </span>
              </h2>
            </div>

            {organisations.length === 0 ? (
              <Card className="text-center py-8 text-xs text-charcoalMuted">
                No organisation applications registered yet.
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {organisations.map((org) => {
                  const isPending = org.approval_status === 'pending';
                  const isApproved = org.approval_status === 'approved';

                  return (
                    <Card key={org.id} className={`border-l-4 ${
                      isPending ? 'border-l-amber-500' : isApproved ? 'border-l-emerald-500' : 'border-l-rose-500'
                    }`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-charcoal">{org.name}</h3>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-cream border border-warmgrey">
                              {org.org_identifier}
                            </span>
                          </div>
                          <p className="text-xs text-charcoalMuted mt-0.5">Admin: {org.admin_name} ({org.admin_email})</p>
                        </div>

                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          isPending ? 'bg-amber-100 text-amber-950 border border-amber-300' :
                          isApproved ? 'bg-emerald-100 text-emerald-950 border border-emerald-300' :
                          'bg-rose-100 text-rose-950 border border-rose-300'
                        }`}>
                          {org.approval_status}
                        </span>
                      </div>

                      {org.rejection_reason && (
                        <div className="mt-2 text-xs text-rose-700 bg-rose-50 p-2 rounded border border-rose-200">
                          Rejection Reason: {org.rejection_reason}
                        </div>
                      )}

                      <div className="mt-4 pt-3 border-t border-warmgrey/80 flex items-center gap-2">
                        {isPending ? (
                          <>
                            <Button
                              variant="primary"
                              size="sm"
                              className="flex-1 text-xs font-semibold"
                              disabled={actionLoading}
                              onClick={() => handleApprove('org', org.id, org.name)}
                            >
                              Approve Organisation
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              className="text-xs font-semibold"
                              disabled={actionLoading}
                              onClick={() => openRejectModal('org', org.id, org.name)}
                            >
                              Reject
                            </Button>
                          </>
                        ) : (
                          <div className="text-xs text-charcoalMuted italic">
                            Evaluated • Status: {org.approval_status}
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECTION 2: Lot Owners */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-charcoal flex items-center gap-2">
                <span>Private Parking Lot Owners</span>
                <span className="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-900 border border-amber-300 font-extrabold">
                  {owners.length}
                </span>
              </h2>
            </div>

            {owners.length === 0 ? (
              <Card className="text-center py-8 text-xs text-charcoalMuted">
                No private owner applications registered yet.
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {owners.map((owner) => {
                  const isPending = owner.approval_status === 'pending';
                  const isApproved = owner.approval_status === 'approved';

                  return (
                    <Card key={owner.id} className={`border-l-4 ${
                      isPending ? 'border-l-amber-500' : isApproved ? 'border-l-emerald-500' : 'border-l-rose-500'
                    }`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-sm font-bold text-charcoal">{owner.business_name}</h3>
                          <p className="text-xs text-charcoalMuted mt-0.5">Contact: {owner.full_name} ({owner.email})</p>
                          {owner.phone && <p className="text-[11px] text-stone-500">Phone: {owner.phone}</p>}
                        </div>

                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          isPending ? 'bg-amber-100 text-amber-950 border border-amber-300' :
                          isApproved ? 'bg-emerald-100 text-emerald-950 border border-emerald-300' :
                          'bg-rose-100 text-rose-950 border border-rose-300'
                        }`}>
                          {owner.approval_status}
                        </span>
                      </div>

                      {owner.rejection_reason && (
                        <div className="mt-2 text-xs text-rose-700 bg-rose-50 p-2 rounded border border-rose-200">
                          Rejection Reason: {owner.rejection_reason}
                        </div>
                      )}

                      <div className="mt-4 pt-3 border-t border-warmgrey/80 flex items-center gap-2">
                        {isPending ? (
                          <>
                            <Button
                              variant="primary"
                              size="sm"
                              className="flex-1 text-xs font-semibold"
                              disabled={actionLoading}
                              onClick={() => handleApprove('owner', owner.id, owner.business_name)}
                            >
                              Approve Lot Owner
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              className="text-xs font-semibold"
                              disabled={actionLoading}
                              onClick={() => openRejectModal('owner', owner.id, owner.business_name)}
                            >
                              Reject
                            </Button>
                          </>
                        ) : (
                          <div className="text-xs text-charcoalMuted italic">
                            Evaluated • Status: {owner.approval_status}
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      <Modal
        isOpen={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        title={`Reject Application: ${rejectTarget?.name || ''}`}
      >
        <form onSubmit={handleConfirmReject} className="space-y-4">
          <Input
            label="Reason for Rejection"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Explain why the provider application was rejected"
            required
            helperText="This reason will be displayed to the provider on their status screen"
          />

          <div className="pt-3 flex justify-end gap-2 border-t border-warmgrey">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setRejectModalOpen(false)}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              size="sm"
              loading={actionLoading}
            >
              Confirm Rejection
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default AdminApprovalsPage;
