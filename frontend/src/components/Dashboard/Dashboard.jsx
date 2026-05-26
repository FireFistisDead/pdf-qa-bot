import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabaseClient';
import './Dashboard.css';

// Sidebar nav items
const NAV_ITEMS = [
  {
    id: 'overview',
    label: 'Overview',
    path: '/dashboard',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
    ),
  },
  {
    id: 'workspace',
    label: 'PDF Workspace',
    path: '/workspace',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
  },
  {
    id: 'knowledge',
    label: 'Knowledge Bases',
    path: '/dashboard/knowledge',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    path: '/dashboard/settings',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    ),
  },
];

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  React.useEffect(() => {
    if (!user) navigate('/');
  }, [user, navigate]);

  if (!user) return null;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const initials = user.user_metadata?.full_name
    ? user.user_metadata.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user.email.charAt(0).toUpperCase();

  return (
    <div className="dashboard-root">

      {/* ── SIDEBAR ── */}
      <aside className={`dashboard-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>

        {/* Logo */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M7 18h10M7 14h10M7 10h6"/>
            </svg>
          </div>
          {!sidebarCollapsed && <span className="sidebar-logo-text">DocuMind</span>}
        </div>

        {/* Nav Links */}
        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              className={`sidebar-nav-item ${location.pathname === item.path ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              <span className="sidebar-nav-icon">{item.icon}</span>
              {!sidebarCollapsed && <span className="sidebar-nav-label">{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* Bottom: User + Sign Out */}
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">{initials}</div>
            {!sidebarCollapsed && (
              <div className="sidebar-user-info">
                <span className="sidebar-user-name">{user.user_metadata?.full_name || 'User'}</span>
                <span className="sidebar-user-email">{user.email}</span>
              </div>
            )}
          </div>
          <button className="sidebar-signout" onClick={handleSignOut} title="Sign Out">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>

        {/* Collapse toggle */}
        <button
          className="sidebar-collapse-btn"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? 'Expand' : 'Collapse'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {sidebarCollapsed
              ? <polyline points="9 18 15 12 9 6"/>
              : <polyline points="15 18 9 12 15 6"/>}
          </svg>
        </button>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <div className="dashboard-main">

        {/* Top Header */}
        <header className="dashboard-header">
          <h1 className="dashboard-page-title">Overview</h1>
          <div className="dashboard-header-right">
            <span className="dashboard-welcome">
              Welcome back, <strong>{user.user_metadata?.full_name || user.email.split('@')[0]}</strong>
            </span>
          </div>
        </header>

        {/* Content */}
        <main className="dashboard-content">

          {/* Stats Row */}
          <div className="dashboard-stats">
            <div className="stat-card">
              <div className="stat-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
              <div>
                <div className="stat-value">0</div>
                <div className="stat-label">Documents Uploaded</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <div>
                <div className="stat-value">0</div>
                <div className="stat-label">Total Queries</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <div>
                <div className="stat-value">—</div>
                <div className="stat-label">Last Active</div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="dashboard-section">
            <h2 className="section-title">Quick Actions</h2>
            <div className="quick-actions">
              <button className="quick-action-card" onClick={() => navigate('/workspace')}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="12" y1="18" x2="12" y2="12"/>
                  <line x1="9" y1="15" x2="15" y2="15"/>
                </svg>
                <span>Upload PDF</span>
              </button>
              <button className="quick-action-card" onClick={() => navigate('/workspace')}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <span>Search Documents</span>
              </button>
            </div>
          </div>

          {/* Account Info */}
          <div className="dashboard-section">
            <h2 className="section-title">Account Info</h2>
            <div className="info-card">
              <div className="info-row">
                <span className="info-key">Email</span>
                <span className="info-val">{user.email}</span>
              </div>
              <div className="info-row">
                <span className="info-key">Name</span>
                <span className="info-val">{user.user_metadata?.full_name || '—'}</span>
              </div>
              <div className="info-row">
                <span className="info-key">User ID</span>
                <span className="info-val info-mono">{user.id}</span>
              </div>
              <div className="info-row">
                <span className="info-key">Provider</span>
                <span className="info-val">{user.app_metadata?.provider || 'email'}</span>
              </div>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
};

export default Dashboard;
