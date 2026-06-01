import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../services/supabaseClient';
import './DashboardLayout.css';

/* ── Nav items ── */
const NAV = [
  { id: 'overview', label: 'OVERVIEW', path: '/dashboard',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> },
  { id: 'documents', label: 'DOCUMENTS', path: '/dashboard/documents',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> },
  { id: 'chat', label: 'AI CHAT', path: '/dashboard/chat',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
  { id: 'knowledge', label: 'KNOWLEDGE', path: '/dashboard/knowledge',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg> },
  { id: 'settings', label: 'SETTINGS', path: '/dashboard/settings',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
];

const DashboardLayout = ({ children }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  React.useEffect(() => {
    if (!user) navigate('/');
  }, [user, navigate]);

  if (!user) return null;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const name = user.user_metadata?.full_name || user.email.split('@')[0];
  const initials = user.user_metadata?.full_name
    ? user.user_metadata.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user.email.charAt(0).toUpperCase();
  const avatar = user.user_metadata?.avatar_url || user.user_metadata?.picture || null;

  return (
    <div className="dash">
      <div className="dash-grid-bg" />

      {/* ── CRAZY FLOATING SIDEBAR ── */}
      <aside className={`dash-side-extreme ${collapsed ? 'collapsed' : ''}`}>
        <div className="dash-side-glow" />
        
        <div className="dash-logo-container" onClick={() => navigate('/dashboard')}>
          <div className="crazy-logo-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M7 18h10M7 14h10M7 10h6"/>
            </svg>
          </div>
          {!collapsed && (
            <div className="logo-text-group">
              <span className="logo-brand">DOCUMIND</span>
              <span className="logo-version">OS // v2.0</span>
            </div>
          )}
        </div>

        <nav className="dash-nav-extreme">
          {NAV.map(n => (
            <button key={n.id}
              className={`crazy-nav-btn ${location.pathname === n.path ? 'active' : ''}`}
              onClick={() => navigate(n.path)}
            >
              <div className="nav-icon-wrapper">
                {n.icon}
                {location.pathname === n.path && <div className="icon-glow-ring" />}
              </div>
              {!collapsed && <span className="nav-label-crazy">{n.label}</span>}
              {location.pathname === n.path && !collapsed && <div className="nav-active-line" />}
            </button>
          ))}
        </nav>

        <div className="dash-user-extreme">
          <div className="user-avatar-crazy">
            {avatar ? <img src={avatar} alt="" loading="lazy" /> : <span>{initials}</span>}
            <div className="user-status-ping" />
          </div>
          {!collapsed && (
            <div className="user-info-crazy">
              <span className="user-name-crazy">{name}</span>
              <span className="user-role-crazy">ADMIN</span>
            </div>
          )}
        </div>

        {/* Collapse Toggle */}
        <button className="crazy-collapse-btn" onClick={() => setCollapsed(!collapsed)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {collapsed ? <polyline points="9 18 15 12 9 6"/> : <polyline points="15 18 9 12 15 6"/>}
          </svg>
        </button>
      </aside>

      {/* ── MAIN AREA ── */}
      <div className={`dash-main-extreme ${collapsed ? 'expanded' : ''}`}>
        <header className="dash-topbar-crazy">
          <div className="topbar-chip">
            <div className="chip-dot" />
            <span>COMMAND_CENTER.EXE</span>
          </div>
          
          <div className="topbar-actions">
            <div className="sys-status">
              <span className="status-dot"/> SYS.ONLINE
            </div>
            <button className="crazy-logout-btn" onClick={handleSignOut}>
              <span className="btn-text">DISCONNECT</span>
              <div className="btn-glitch-effect" />
            </button>
          </div>
        </header>

        <div className="dash-content-wrapper">
          {children}
        </div>
      </div>
    </div>
  );
};

export default DashboardLayout;
