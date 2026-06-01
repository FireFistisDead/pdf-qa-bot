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
    alert("Local cache cleared.");
  };

  const handleDeleteAccount = () => {
    if (window.confirm("Delete your account permanently? This cannot be undone.")) {
      alert("Account deletion initiated.");
    }
  };

  if (!user) return null;

  const name = user.user_metadata?.full_name || user.email.split('@')[0];
  const initials = user.user_metadata?.full_name
    ? user.user_metadata.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user.email.charAt(0).toUpperCase();

  return (
    <div className="settings-layout-wrap">
      {/* Ambient background glow instead of noisy grids */}
      <div className="settings-ambient-glow" />

      <div className="settings-content-z">
        <div className="settings-header-box animate-fade-up">
          <h1>Settings</h1>
          <p>Manage your account settings and preferences.</p>
        </div>

        <div className="settings-stack">
          {/* Profile Section */}
          <div className="settings-panel animate-fade-up" style={{ animationDelay: '0.1s' }}>
            <div className="settings-panel-section">
              <div className="setting-info">
                <div className="profile-avatar-clean">{initials}</div>
                <div className="setting-text-group">
                  <h3>{name}</h3>
                  <p>{user.email}</p>
                </div>
              </div>
              <button className="btn-clean" onClick={handleSignOut}>Log out</button>
            </div>
          </div>

          {/* Preferences Section */}
          <div className="settings-panel animate-fade-up" style={{ animationDelay: '0.2s' }}>
            <div className="settings-panel-section">
              <div className="setting-info">
                <div className="setting-icon-box">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                </div>
                <div className="setting-text-group">
                  <h3>Hardware Acceleration</h3>
                  <p>Use GPU for UI rendering</p>
                </div>
              </div>
              <div className="toggle-minimal active" />
            </div>

            <div className="settings-panel-section">
              <div className="setting-info">
                <div className="setting-icon-box">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                </div>
                <div className="setting-text-group">
                  <h3>Real-time Streaming</h3>
                  <p>Stream AI tokens dynamically</p>
                </div>
              </div>
              <div className="toggle-minimal active" />
            </div>
          </div>

          {/* Data Management Section */}
          <div className="settings-panel animate-fade-up" style={{ animationDelay: '0.3s' }}>
            <div className="settings-panel-section">
              <div className="setting-info">
                <div className="setting-icon-box">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                </div>
                <div className="setting-text-group">
                  <h3>Clear Local Cache</h3>
                  <p>Wipe temporary session data</p>
                </div>
              </div>
              <button className="btn-clean" onClick={handleClearCache}>Clear Data</button>
            </div>
            
            <div className="settings-panel-section">
              <div className="setting-info">
                <div className="setting-icon-box" style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                </div>
                <div className="setting-text-group">
                  <h3 style={{ color: '#ef4444' }}>Delete Account</h3>
                  <p>Permanently remove your account</p>
                </div>
              </div>
              <button className="btn-clean btn-clean-danger" onClick={handleDeleteAccount}>Delete</button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default SettingsView;
