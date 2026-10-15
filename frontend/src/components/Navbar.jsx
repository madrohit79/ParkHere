import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from './Button';

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  function isActive(path) {
    return location.pathname === path;
  }

  const linkClass = (path) =>
    `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
      isActive(path)
        ? 'bg-accent/40 text-charcoal font-semibold border border-amber-300'
        : 'text-charcoal hover:bg-stone-200/50'
    }`;

  return (
    <header className="bg-surface border-b border-warmgrey sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-6">
            <Link to={user?.role === 'org_admin' ? '/org/dashboard' : '/'} className="flex items-center gap-2 group">
              <div className="w-9 h-9 rounded bg-accent border border-yellow-500 flex items-center justify-center font-black text-charcoal shadow-xs group-hover:bg-yellow-400 transition-colors">
                P
              </div>
              <div>
                <span className="text-lg font-black tracking-tight text-charcoal">ParkHere</span>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {user?.role !== 'org_admin' && (
                <Link to="/search" className={linkClass('/search')}>
                  Find Parking
                </Link>
              )}

              {user?.role === 'customer' && (
                <>
                  <Link to="/customer/dashboard" className={linkClass('/customer/dashboard')}>
                    My Bookings
                  </Link>
                  <Link to="/customer/membership" className={linkClass('/customer/membership')}>
                    Verify Membership
                  </Link>
                </>
              )}

              {user?.role === 'org_admin' && (
                <>
                  <Link to="/org/dashboard" className={linkClass('/org/dashboard')}>
                    Dashboard
                  </Link>
                  <Link to="/org/locations" className={linkClass('/org/locations')}>
                    Manage Locations
                  </Link>
                  <Link to="/org/terminal" className={linkClass('/org/terminal')}>
                    Gate Terminal
                  </Link>
                  <Link to="/org/members" className={linkClass('/org/members')}>
                    Members
                  </Link>
                </>
              )}

              {user?.role === 'owner' && (
                <>
                  <Link to="/owner/dashboard" className={linkClass('/owner/dashboard')}>
                    Dashboard
                  </Link>
                  <Link to="/owner/locations" className={linkClass('/owner/locations')}>
                    My Locations
                  </Link>
                  <Link to="/owner/terminal" className={linkClass('/owner/terminal')}>
                    Gate Terminal
                  </Link>
                </>
              )}

              {user?.role === 'platform_admin' && (
                <>
                  <Link to="/admin/dashboard" className={linkClass('/admin/dashboard')}>
                    Overview
                  </Link>
                  <Link to="/admin/approvals" className={linkClass('/admin/approvals')}>
                    Approvals
                  </Link>
                  <Link to="/admin/users" className={linkClass('/admin/users')}>
                    Users
                  </Link>
                  <Link to="/admin/listings" className={linkClass('/admin/listings')}>
                    Listings
                  </Link>
                </>
              )}
            </nav>
          </div>

          {/* User Profile / Auth Actions */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-xs font-bold text-charcoal">{user.full_name}</div>
                  <div className="text-[10px] uppercase font-semibold text-charcoalMuted tracking-wider">
                    {user.role.replace('_', ' ')}
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={handleLogout}>
                  Sign Out
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login">
                  <Button variant="secondary" size="sm">
                    Sign In
                  </Button>
                </Link>
                <Link to="/register">
                  <Button variant="primary" size="sm">
                    Register
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="flex md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded text-charcoal hover:bg-stone-100"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-warmgrey bg-surface px-4 pt-2 pb-4 space-y-1">
          {user?.role !== 'org_admin' && (
            <Link
              to="/search"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded text-sm font-medium text-charcoal hover:bg-cream"
            >
              Find Parking
            </Link>
          )}

          {user?.role === 'customer' && (
            <>
              <Link
                to="/customer/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded text-sm font-medium text-charcoal hover:bg-cream"
              >
                My Bookings
              </Link>
              <Link
                to="/customer/membership"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded text-sm font-medium text-charcoal hover:bg-cream"
              >
                Verify Membership
              </Link>
            </>
          )}

          {user?.role === 'org_admin' && (
            <>
              <Link to="/org/dashboard" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm font-medium">Dashboard</Link>
              <Link to="/org/locations" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm font-medium">Manage Locations</Link>
              <Link to="/org/terminal" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm font-medium">Gate Terminal</Link>
              <Link to="/org/members" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm font-medium">Members Directory</Link>
            </>
          )}

          {user?.role === 'owner' && (
            <>
              <Link to="/owner/dashboard" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm font-medium">Dashboard</Link>
              <Link to="/owner/locations" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm font-medium">Locations</Link>
              <Link to="/owner/terminal" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm font-medium">Gate Terminal</Link>
            </>
          )}

          {user?.role === 'platform_admin' && (
            <>
              <Link to="/admin/dashboard" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm font-medium">Overview</Link>
              <Link to="/admin/approvals" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm font-medium">Approvals</Link>
              <Link to="/admin/users" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm font-medium">Users</Link>
              <Link to="/admin/listings" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm font-medium">Listings</Link>
            </>
          )}

          <div className="pt-4 border-t border-warmgrey flex flex-col gap-2">
            {user ? (
              <Button variant="secondary" size="sm" onClick={() => { handleLogout(); setMobileMenuOpen(false); }}>
                Sign Out ({user.full_name})
              </Button>
            ) : (
              <>
                <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="secondary" size="sm" className="w-full">Sign In</Button>
                </Link>
                <Link to="/register" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="primary" size="sm" className="w-full">Register</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

export default Navbar;
