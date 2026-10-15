import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { Card } from '../components/Card';
import { Table } from '../components/Table';
import { Button } from '../components/Button';
import { Input, Select } from '../components/Input';
import { Modal } from '../components/Modal';
import { Spinner } from '../components/Spinner';
import { Alert } from '../components/Alert';

export function OrgMembersPage() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [form, setForm] = useState({
    member_identifier: '',
    full_name: '',
    email: '',
    phone: '',
    parking_benefit: 'discounted'
  });

  useEffect(() => {
    fetchMembers();
  }, []);

  async function fetchMembers() {
    setLoading(true);
    try {
      const res = await apiRequest('/api/org/members');
      if (res.success) {
        setMembers(res.data || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch members');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddMember(e) {
    e.preventDefault();
    setModalLoading(true);
    setFeedback(null);
    try {
      const res = await apiRequest('/api/org/members', {
        method: 'POST',
        body: form
      });

      if (res.success) {
        setIsModalOpen(false);
        setForm({
          member_identifier: '',
          full_name: '',
          email: '',
          phone: '',
          parking_benefit: 'discounted'
        });
        setFeedback({ type: 'success', message: 'Member added to directory successfully!' });
        await fetchMembers();
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to add member' });
    } finally {
      setModalLoading(false);
    }
  }

  async function handleToggleActive(member) {
    try {
      const res = await apiRequest(`/api/org/members/${member.id}/toggle-active`, {
        method: 'PATCH'
      });
      if (res.success) {
        setMembers((prev) =>
          prev.map((m) => (m.id === member.id ? { ...m, is_active: !m.is_active } : m))
        );
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to toggle member status' });
    }
  }

  const filteredMembers = members.filter((m) => {
    const term = search.toLowerCase();
    return (
      m.member_identifier.toLowerCase().includes(term) ||
      m.full_name.toLowerCase().includes(term) ||
      m.email.toLowerCase().includes(term)
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Breadcrumb & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-warmgrey">
        <div>
          <div className="text-xs text-charcoalMuted mb-1">
            <Link to="/org/dashboard" className="hover:underline">Dashboard</Link> / Member Directory
          </div>
          <h1 className="text-2xl font-black text-charcoal">Pre-Authorized Member Directory</h1>
          <p className="text-xs text-charcoalMuted mt-1">
            Students and faculty members eligible for 4-point verification and reserved campus parking
          </p>
        </div>

        <Button variant="primary" size="md" onClick={() => setIsModalOpen(true)}>
          <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          Add New Member
        </Button>
      </div>

      {feedback && <Alert type={feedback.type} message={feedback.message} />}
      {error && <Alert type="error" message={error} />}

      {/* Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 max-w-md">
          <Input
            placeholder="Search by ID, name, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="text-xs text-charcoalMuted flex items-center">
          Showing {filteredMembers.length} of {members.length} members
        </div>
      </div>

      {/* Directory Table */}
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Spinner size="md" />
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <Table
            headers={['Member ID', 'Full Name', 'Contact Info', 'Benefit Tier', 'Claim Status', 'Active', 'Actions']}
          >
            {filteredMembers.length === 0 ? (
              <tr>
                <td colSpan="7" className="px-4 py-8 text-center text-charcoalMuted text-xs">
                  No members found matching your search.
                </td>
              </tr>
            ) : (
              filteredMembers.map((m) => (
                <tr key={m.id} className="hover:bg-cream/40 transition-colors">
                  <td className="px-4 py-3 font-mono font-bold text-xs text-charcoal">
                    {m.member_identifier}
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-charcoal">
                    {m.full_name}
                  </td>
                  <td className="px-4 py-3 text-xs text-charcoalMuted">
                    <div>{m.email}</div>
                    {m.phone && <div className="text-[11px] text-stone-500">{m.phone}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${
                        m.parking_benefit === 'free'
                          ? 'bg-emerald-100 text-emerald-950 border border-emerald-300'
                          : m.parking_benefit === 'discounted'
                          ? 'bg-amber-100 text-amber-950 border border-amber-300'
                          : 'bg-stone-100 text-stone-800 border border-warmgrey'
                      }`}
                    >
                      {m.parking_benefit}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {m.customer_id ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-xs">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Linked to {m.linked_customer_email || 'Driver'}
                      </span>
                    ) : (
                      <span className="text-charcoalMuted text-xs italic">Unclaimed</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span
                      className={`inline-block w-2.5 h-2.5 rounded-full ${
                        m.is_active ? 'bg-emerald-500' : 'bg-stone-300'
                      }`}
                      title={m.is_active ? 'Active' : 'Suspended'}
                    />
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(m)}
                      className={`text-xs font-semibold px-2.5 py-1 rounded border transition-colors ${
                        m.is_active
                          ? 'text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100'
                          : 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                      }`}
                    >
                      {m.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </Table>
        </Card>
      )}

      {/* Add Member Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add Pre-Authorized Member"
      >
        <form onSubmit={handleAddMember} className="space-y-4">
          <Input
            label="Member Identifier (Roll / Staff ID)"
            value={form.member_identifier}
            onChange={(e) => setForm({ ...form, member_identifier: e.target.value })}
            placeholder="e.g. 21BCE1001"
            required
            helperText="Used by the student/employee during 4-point verification"
          />

          <Input
            label="Full Name"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            placeholder="e.g. Rahul Sharma"
            required
          />

          <Input
            label="Institutional Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="e.g. rahul.sharma2021@vitstudent.ac.in"
            required
          />

          <Input
            label="Phone Number (Optional)"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="10-digit mobile number"
          />

          <Select
            label="Parking Benefit Tier"
            value={form.parking_benefit}
            onChange={(e) => setForm({ ...form, parking_benefit: e.target.value })}
            options={[
              { value: 'discounted', label: 'Discounted (Applies location member discount %)' },
              { value: 'free', label: 'Free (100% discount on all bookings)' },
              { value: 'standard', label: 'Standard (Permits access to reserved member pool)' }
            ]}
          />

          <div className="pt-2 flex justify-end gap-2 border-t border-warmgrey">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsModalOpen(false)}
              disabled={modalLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={modalLoading}
            >
              Save Member
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default OrgMembersPage;
