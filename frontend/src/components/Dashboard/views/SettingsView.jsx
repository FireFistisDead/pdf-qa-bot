import React from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../services/supabaseClient';
import { useNavigate } from 'react-router-dom';
import './SettingsView.css';

const SettingsView = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const handleClearCache = () => {
    sessionStorage.removeItem('pdfqa_sessions');
    alert('Local cache cleared.');
  };

  const handleDeleteAccount = () => {
    if (window.confirm('Delete your account permanently? This cannot be undone.')) {
      alert('Account deletion initiated.');
    }
  };

  if (!user) return null;

  const name = user.user_metadata?.full_name || user.email.split('@')[0];
  const initials = user.user_metadata?.full_name
    ? user.user_metadata.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user.email.charAt(0).toUpperCase();

  return (
    <div className="settings-wrap">
      {/* BG */}
      <div className="settings-bg-grid" />
      <div className="settings-orb" />

      <div className="settings-inner">

        {/* ── HERO HEADING (same style as KNOWLEDGE MODULE) ── */}
        <div className="settings-hero settings-fade-in">
          <div className="settings-status-badge">
            <span className="settings-status-dot" />
            USER CONFIG ACTIVE
          </div>
          <h1 className="settings-title">
            SETTINGS
            <span className="settings-title-neon">MODULE</span>
          </h1>
        </div>

        {/* ── PROFILE ── */}
        <div className="settings-panel-group settings-fade-in" style={{ animationDelay: '0.15s' }}>
          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-profile-avatar">{initials}</div>
              <div className="settings-row-text">
                <h3>{name}</h3>
                <p>{user.email}</p>
              </div>
            </div>
            <button className="settings-btn" onClick={handleSignOut}>Log Out</button>
          </div>
        </div>

        {/* ── PREFERENCES ── */}
        <div className="settings-panel-group settings-fade-in" style={{ animationDelay: '0.25s' }}>
          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <div className="settings-row-text">
                <h3>Hardware Acceleration</h3>
                <p>Use GPU for UI rendering</p>
              </div>
            </div>
            <div className="s-toggle on" />
          </div>

          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <div className="settings-row-text">
                <h3>Real-time Streaming</h3>
                <p>Stream AI tokens via Groq SSE</p>
              </div>
            </div>
            <div className="s-toggle on" />
          </div>

          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
              </div>
              <div className="settings-row-text">
                <h3>Hybrid Retrieval Mode</h3>
                <p>FAISS + BM25 combined search</p>
              </div>
            </div>
            <div className="s-toggle on" />
          </div>
        </div>

        {/* ── DATA MANAGEMENT ── */}
        <div className="settings-panel-group settings-fade-in" style={{ animationDelay: '0.35s' }}>
          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 .49-3.51"></path>
                </svg>
              </div>
              <div className="settings-row-text">
                <h3>Clear Local Cache</h3>
                <p>Wipe session credentials from storage</p>
              </div>
            </div>
            <button className="settings-btn" onClick={handleClearCache}>Clear</button>
          </div>
        </div>

        {/* ── DANGER ZONE ── */}
        <div className="settings-panel-group danger settings-fade-in" style={{ animationDelay: '0.45s' }}>
          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-icon" style={{ borderColor: 'rgba(239,68,68,0.2)', color: '#ef4444', background: 'rgba(239,68,68,0.05)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              </div>
              <div className="settings-row-text">
                <h3 style={{ color: '#ef4444' }}>Delete Account</h3>
                <p>Permanently remove account and all data</p>
              </div>
            </div>
            <button className="settings-btn settings-btn-danger" onClick={handleDeleteAccount}>Delete</button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default SettingsView;
