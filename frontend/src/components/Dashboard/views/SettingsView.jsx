import React, { useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../services/supabaseClient';
import { useNavigate } from 'react-router-dom';
import './SettingsView.css';

const SettingsView = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Staggered entrance animation for panels
    const panels = document.querySelectorAll('.animate-on-load');
    panels.forEach((panel, index) => {
      setTimeout(() => {
        panel.classList.add('fade-in-up');
      }, index * 100);
    });
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const handleClearCache = () => {
    sessionStorage.removeItem('pdfqa_sessions');
    // We could add a toast notification here
    alert("Local chat sessions cleared successfully.");
  };

  const handleDeleteAccount = () => {
    if (window.confirm("WARNING: This action is irreversible. All your uploaded documents and chat history will be permanently deleted. Are you sure?")) {
      // Logic for deleting account would go here, usually calling a backend endpoint.
      alert("Account deletion sequence initiated (Mocked).");
    }
  };

  if (!user) return null;

  const name = user.user_metadata?.full_name || user.email.split('@')[0];
  const initials = user.user_metadata?.full_name
    ? user.user_metadata.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user.email.charAt(0).toUpperCase();

  return (
    <div className="settings-layout-wrap">
      {/* Animated Background */}
      <div className="settings-bg-grid" />
      <div className="settings-bg-orb settings-bg-orb-1" />
      <div className="settings-bg-orb settings-bg-orb-2" />

      {/* Content wrapper to float above background */}
      <div className="settings-content-z">
        <div className="settings-header-box animate-on-load">
          <h1>SETTINGS MODULE</h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', marginTop: '8px' }}>
            Configure your DocuMind OS preferences and manage your account.
          </p>
        </div>

        <div className="settings-grid">
        {/* Left Column */}
        <div className="settings-column">
          {/* Profile Panel */}
          <div className="settings-panel animate-on-load" style={{ marginBottom: '40px' }}>
            <h2>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              User Profile
            </h2>
            <div className="profile-info-flex">
              <div className="profile-avatar-large">
                {initials}
              </div>
              <div className="profile-details">
                <h3>{name}</h3>
                <p>{user.email}</p>
                <p style={{ fontSize: '0.8rem', marginTop: '4px', color: '#8B5CF6' }}>ADMINISTRATOR</p>
              </div>
            </div>
            <button className="btn-crazy-outline" onClick={handleSignOut}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
              Sign Out Securely
            </button>
          </div>

          {/* Preferences Panel */}
          <div className="settings-panel animate-on-load">
            <h2>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              System Preferences
            </h2>
            <div className="setting-row">
              <div className="setting-label-group">
                <strong>Hardware Acceleration</strong>
                <span>Utilize GPU for intense UI physics</span>
              </div>
              <div className="toggle-switch-mock" style={{ color: '#10B981', fontWeight: 'bold' }}>ENABLED</div>
            </div>
            <div className="setting-row">
              <div className="setting-label-group">
                <strong>Real-time Streaming</strong>
                <span>Stream AI tokens via SSE (Groq API)</span>
              </div>
              <div className="toggle-switch-mock" style={{ color: '#10B981', fontWeight: 'bold' }}>ENABLED</div>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="settings-column">
          {/* Data Management */}
          <div className="settings-panel animate-on-load" style={{ marginBottom: '40px' }}>
            <h2>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              Data Management
            </h2>
            <div className="setting-row">
              <div className="setting-label-group">
                <strong>Local Chat Cache</strong>
                <span>Clear all sessionStorage keys storing chat credentials</span>
              </div>
              <button 
                className="btn-crazy-outline" 
                style={{ width: 'auto', padding: '6px 12px', fontSize: '0.9rem' }}
                onClick={handleClearCache}
              >
                Clear Cache
              </button>
            </div>
            <div className="setting-row">
              <div className="setting-label-group">
                <strong>Document Vectors</strong>
                <span>Manage FAISS indexes for uploaded PDFs</span>
              </div>
              <button className="btn-crazy-outline" style={{ width: 'auto', padding: '6px 12px', fontSize: '0.9rem', opacity: 0.5, cursor: 'not-allowed' }}>
                Manage
              </button>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="settings-panel panel-danger animate-on-load">
            <h2 style={{ color: '#ef4444' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
              Danger Zone
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '20px', fontSize: '0.95rem' }}>
              Actions performed here are permanent and cannot be undone. Proceed with extreme caution.
            </p>
            <button className="btn-crazy-outline btn-crazy-danger" onClick={handleDeleteAccount}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              Permanently Delete Account
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default SettingsView;
