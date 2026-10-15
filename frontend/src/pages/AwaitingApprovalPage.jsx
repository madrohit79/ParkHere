import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Alert } from '../components/Alert';

export function AwaitingApprovalPage() {
  const { user, approvalStatus, isApproved, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [feedback, setFeedback] = useState(null);

  async function handleCheckStatus() {
    setChecking(true);
    setFeedback(null);
    try {
      await refreshUser();
      if (isApproved) {
        if (user?.role === 'org_admin') {
          navigate('/org/dashboard');
        } else if (user?.role === 'owner') {
          navigate('/owner/dashboard');
        } else {
          navigate('/');
        }
      } else {
        setFeedback({ type: 'info', message: 'Status is still pending review by the platform administrator.' });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: 'Failed to refresh status. Please try again.' });
    } finally {
      setChecking(false);
    }
  }

  const rejectionReason = user?.role === 'org_admin'
    ? user?.org?.rejection_reason
    : user?.ownerProfile?.rejection_reason;

  const entityName = user?.role === 'org_admin'
    ? user?.org?.name || 'Institution Admin'
    : user?.ownerProfile?.business_name || 'Parking Lot Owner';

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-lg space-y-6">
        <Card>
          <div className="text-center py-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800 mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <h2 className="text-xl font-bold text-charcoal">Provider Approval Required</h2>
            <p className="text-xs text-charcoalMuted mt-1">
              Account registered for <span className="font-semibold text-charcoal">{entityName}</span>
            </p>

            <div className="mt-4 flex justify-center">
              {approvalStatus === 'rejected' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-950 border border-rose-300">
                  Application Rejected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-950 border border-amber-300">
                  <span className="w-2 h-2 rounded-full bg-amber-600 animate-ping" />
                  Verification Pending
                </span>
              )}
            </div>
          </div>

          {feedback && <Alert type={feedback.type} message={feedback.message} className="my-4" />}

          {approvalStatus === 'rejected' && rejectionReason && (
            <div className="my-4 p-3.5 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-900">
              <span className="font-bold block mb-1">Reason for Rejection:</span>
              {rejectionReason}
            </div>
          )}

          <div className="my-6 p-4 bg-cream border border-warmgrey rounded-lg text-xs space-y-2 text-charcoal">
            <div className="font-bold flex items-center gap-1 text-amber-900">
              <svg className="w-4 h-4 text-amber-700" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              Platform Verification Policy
            </div>
            <p className="text-charcoalMuted leading-relaxed">
              To protect parking security and customer confidence, all new organization and private lot provider accounts are verified prior to listing spaces or operating gate terminals. Our platform administrators review applications within 1-2 business days.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              variant="primary"
              size="md"
              loading={checking}
              onClick={handleCheckStatus}
              className="flex-1 font-semibold"
            >
              Check Approval Status
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              Sign Out
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default AwaitingApprovalPage;
