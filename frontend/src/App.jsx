import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth, AuthProvider } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Spinner } from './components/Spinner';

// Pages
import LandingPage from './pages/LandingPage';
import SearchPage from './pages/SearchPage';
import LocationDetailPage from './pages/LocationDetailPage';
import BookingDetailPage from './pages/BookingDetailPage';
import CustomerDashboard from './pages/CustomerDashboard';
import MembershipVerificationPage from './pages/MembershipVerificationPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AwaitingApprovalPage from './pages/AwaitingApprovalPage';

import OrgDashboard from './pages/OrgDashboard';
import OrgMembersPage from './pages/OrgMembersPage';
import OrgLocationsPage from './pages/OrgLocationsPage';

import OwnerDashboard from './pages/OwnerDashboard';
import OwnerLocationsPage from './pages/OwnerLocationsPage';

import GateTerminalPage from './pages/GateTerminalPage';

import AdminDashboard from './pages/AdminDashboard';
import AdminApprovalsPage from './pages/AdminApprovalsPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminListingsPage from './pages/AdminListingsPage';

import NotFoundPage from './pages/NotFoundPage';

// Route Guard Component
function ProtectedRoute({ children, allowedRoles = [], checkApproval = false }) {
  const { user, loading, isApproved } = useAuth();

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[70vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    if (user.role === 'org_admin') {
      return <Navigate to="/org/dashboard" replace />;
    }
    if (user.role === 'owner') {
      return <Navigate to="/owner/dashboard" replace />;
    }
    if (user.role === 'platform_admin') {
      return <Navigate to="/admin/dashboard" replace />;
    }
    return <Navigate to="/" replace />;
  }

  if (checkApproval && !isApproved) {
    return <Navigate to="/awaiting-approval" replace />;
  }

  return children;
}

// Route Guard for customer-facing discovery and search pages (strictly prohibits org_admin)
function CustomerFacingRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[70vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  // Organization admins must never access customer-facing search or booking
  if (user?.role === 'org_admin') {
    return <Navigate to="/org/dashboard" replace />;
  }

  return children;
}

export function AppContent() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-cream">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream text-charcoal flex flex-col font-sans">
      <Navbar />
      <main className="flex-1">
        <Routes>
          {/* Public & Customer-Facing Routes */}
          <Route
            path="/"
            element={
              <CustomerFacingRoute>
                <LandingPage />
              </CustomerFacingRoute>
            }
          />
          <Route
            path="/search"
            element={
              <CustomerFacingRoute>
                <SearchPage />
              </CustomerFacingRoute>
            }
          />
          <Route
            path="/locations/:id"
            element={
              <CustomerFacingRoute>
                <LocationDetailPage />
              </CustomerFacingRoute>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/awaiting-approval" element={<AwaitingApprovalPage />} />

          {/* Customer Routes */}
          <Route
            path="/customer/dashboard"
            element={
              <ProtectedRoute allowedRoles={['customer']}>
                <CustomerDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/customer/membership"
            element={
              <ProtectedRoute allowedRoles={['customer']}>
                <MembershipVerificationPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bookings/:id"
            element={
              <ProtectedRoute allowedRoles={['customer', 'platform_admin']}>
                <BookingDetailPage />
              </ProtectedRoute>
            }
          />

          {/* Org Admin Routes */}
          <Route
            path="/org/dashboard"
            element={
              <ProtectedRoute allowedRoles={['org_admin']} checkApproval={true}>
                <OrgDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/org/members"
            element={
              <ProtectedRoute allowedRoles={['org_admin']} checkApproval={true}>
                <OrgMembersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/org/locations"
            element={
              <ProtectedRoute allowedRoles={['org_admin']} checkApproval={true}>
                <OrgLocationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/org/terminal"
            element={
              <ProtectedRoute allowedRoles={['org_admin']} checkApproval={true}>
                <GateTerminalPage />
              </ProtectedRoute>
            }
          />

          {/* Owner Routes */}
          <Route
            path="/owner/dashboard"
            element={
              <ProtectedRoute allowedRoles={['owner']} checkApproval={true}>
                <OwnerDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/owner/locations"
            element={
              <ProtectedRoute allowedRoles={['owner']} checkApproval={true}>
                <OwnerLocationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/owner/terminal"
            element={
              <ProtectedRoute allowedRoles={['owner']} checkApproval={true}>
                <GateTerminalPage />
              </ProtectedRoute>
            }
          />

          {/* Platform Admin Routes */}
          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoute allowedRoles={['platform_admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/approvals"
            element={
              <ProtectedRoute allowedRoles={['platform_admin']}>
                <AdminApprovalsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute allowedRoles={['platform_admin']}>
                <AdminUsersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/listings"
            element={
              <ProtectedRoute allowedRoles={['platform_admin']}>
                <AdminListingsPage />
              </ProtectedRoute>
            }
          />

          {/* 404 Catch All */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>

      <footer className="bg-surface border-t border-warmgrey py-6 mt-12 text-center text-xs text-charcoalMuted">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-charcoal">ParkHere</span>
            <span>• Smart Parking Management & Reservation Platform</span>
          </div>
          <div>
            © {new Date().getFullYear()} ParkHere. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
