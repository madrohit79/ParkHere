import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { Card } from '../components/Card';
import { Table } from '../components/Table';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Spinner } from '../components/Spinner';
import { Alert } from '../components/Alert';

export function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await apiRequest('/api/admin/users');
      if (res.success) {
        setUsers(res.data || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleActive(user) {
    setFeedback(null);
    try {
      const res = await apiRequest(`/api/admin/users/${user.id}/toggle-active`, {
        method: 'PATCH'
      });
      if (res.success) {
        setUsers((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, is_active: !u.is_active } : u))
        );
        setFeedback({
          type: 'success',
          message: `User ${user.full_name} (${user.email}) is now ${!user.is_active ? 'active' : 'suspended'}.`
        });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to toggle user status' });
    }
  }

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());

    const matchesRole = roleFilter === 'all' || u.role === roleFilter;

    return matchesSearch && matchesRole;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-warmgrey">
        <div>
          <div className="text-xs text-charcoalMuted mb-1">
            <Link to="/admin/dashboard" className="hover:underline">Dashboard</Link> / User Directory
          </div>
          <h1 className="text-2xl font-black text-charcoal">Platform User Directory</h1>
          <p className="text-xs text-charcoalMuted mt-1">
            Audit user accounts, roles, and manage access authorization across the platform
          </p>
        </div>

        <Button variant="secondary" size="sm" onClick={fetchUsers}>
          Refresh Users
        </Button>
      </div>

      {feedback && <Alert type={feedback.type} message={feedback.message} />}
      {error && <Alert type="error" message={error} />}

      {/* Filter Row */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 max-w-md">
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {['all', 'customer', 'org_admin', 'owner', 'platform_admin'].map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => setRoleFilter(role)}
              className={`px-3 py-1.5 text-xs font-semibold rounded border transition-colors capitalize ${
                roleFilter === role
                  ? 'bg-accent/40 border-amber-400 text-charcoal font-bold shadow-xs'
                  : 'bg-surface border-warmgrey text-charcoalMuted hover:bg-stone-50'
              }`}
            >
              {role.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <Table
            headers={['ID', 'User', 'Contact', 'Role', 'Account Status', 'Created', 'Actions']}
          >
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan="7" className="px-4 py-8 text-center text-charcoalMuted text-xs">
                  No users found matching your filters.
                </td>
              </tr>
            ) : (
              filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-cream/40 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-charcoalMuted">#{u.id}</td>
                  <td className="px-4 py-3 text-xs font-bold text-charcoal">
                    {u.full_name}
                  </td>
                  <td className="px-4 py-3 text-xs text-charcoalMuted">
                    <div>{u.email}</div>
                    {u.phone && <div className="text-[11px] text-stone-500">{u.phone}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${
                      u.role === 'platform_admin' ? 'bg-purple-100 text-purple-950 border border-purple-300' :
                      u.role === 'org_admin' ? 'bg-blue-100 text-blue-950 border border-blue-300' :
                      u.role === 'owner' ? 'bg-amber-100 text-amber-950 border border-amber-300' :
                      'bg-stone-100 text-stone-800 border border-warmgrey'
                    }`}>
                      {u.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold ${
                      u.is_active ? 'bg-emerald-100 text-emerald-950 border border-emerald-300' : 'bg-rose-100 text-rose-950 border border-rose-300'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-600' : 'bg-rose-600'}`} />
                      {u.is_active ? 'Active' : 'Suspended'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-charcoalMuted">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {u.role !== 'platform_admin' ? (
                      <button
                        type="button"
                        onClick={() => handleToggleActive(u)}
                        className={`text-xs font-semibold px-2.5 py-1 rounded border transition-colors ${
                          u.is_active
                            ? 'text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100'
                            : 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                        }`}
                      >
                        {u.is_active ? 'Suspend' : 'Reactivate'}
                      </button>
                    ) : (
                      <span className="text-[11px] text-charcoalMuted italic">Protected</span>
                    )}
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

export default AdminUsersPage;
