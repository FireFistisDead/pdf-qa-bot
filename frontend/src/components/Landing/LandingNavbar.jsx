import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabaseClient';
import './Navbar.css';

const LandingNavbar = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <nav className="navbar" id="landing-navbar">
      {/* Logo */}
      <a href="/" className="navbar-logo" id="navbar-logo">
        <div className="navbar-logo-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3">
            <path d="M7 18h10M7 14h10M7 10h6" />
          </svg>
        </div>
        <span className="navbar-logo-text">DOCUMIND</span>
      </a>

      {/* Center Links */}
      <div className="navbar-links" id="navbar-links">
        <a href="#features" className="navbar-link">Features</a>
        <a href="#how-it-works" className="navbar-link">How It Works</a>
        <a href="#pricing" className="navbar-link">Pricing</a>
        <a href="#faq" className="navbar-link">FAQ</a>
      </div>

      {/* Actions */}
      <div className="navbar-actions" id="navbar-actions">
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button className="navbar-btn-login" onClick={() => navigate('/dashboard')}>
              Dashboard
            </button>

            {/* Profile Dropdown */}
            <div style={{ position: 'relative' }} ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                style={{
                  background: 'var(--accent, #c8ff00)',
                  color: '#000',
                  border: '2px solid #000',
                  borderRadius: '50%',
                  width: '40px',
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  fontFamily: 'var(--font-mono, monospace)',
                  cursor: 'pointer',
                  boxShadow: '2px 2px 0px rgba(255,255,255,0.2)'
                }}
                title="Profile"
              >
                {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
              </button>

              {dropdownOpen && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 12px)',
                  right: 0,
                  background: '#1a1a1a',
                  border: '1px solid #333',
                  borderRadius: '8px',
                  minWidth: '200px',
                  zIndex: 1000,
                  overflow: 'hidden',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
                }}>
                  {/* User Info Header */}
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid #333' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#fff' }}>
                      {user.user_metadata?.full_name || 'User'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#888', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user.email}
                    </div>
                  </div>

                  {/* Menu Items */}
                  <div>
                    <button
                      onClick={() => { navigate('/dashboard'); setDropdownOpen(false); }}
                      style={{
                        display: 'block', width: '100%', padding: '12px 16px',
                        background: 'transparent', border: 'none', color: '#ccc',
                        textAlign: 'left', cursor: 'pointer', fontSize: '14px',
                      }}
                      onMouseEnter={e => e.target.style.background = '#252525'}
                      onMouseLeave={e => e.target.style.background = 'transparent'}
                    >
                      📊 Dashboard
                    </button>
                    <button
                      onClick={() => { navigate('/workspace'); setDropdownOpen(false); }}
                      style={{
                        display: 'block', width: '100%', padding: '12px 16px',
                        background: 'transparent', border: 'none', color: '#ccc',
                        textAlign: 'left', cursor: 'pointer', fontSize: '14px',
                      }}
                      onMouseEnter={e => e.target.style.background = '#252525'}
                      onMouseLeave={e => e.target.style.background = 'transparent'}
                    >
                      📄 PDF Workspace
                    </button>
                    <div style={{ borderTop: '1px solid #333' }}>
                      <button
                        onClick={() => { supabase.auth.signOut(); setDropdownOpen(false); }}
                        style={{
                          display: 'block', width: '100%', padding: '12px 16px',
                          background: 'transparent', border: 'none', color: '#ff4444',
                          textAlign: 'left', cursor: 'pointer', fontSize: '14px',
                        }}
                        onMouseEnter={e => e.target.style.background = '#2a1111'}
                        onMouseLeave={e => e.target.style.background = 'transparent'}
                      >
                        🚪 Sign Out
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            <button className="navbar-btn-login" id="btn-login" onClick={() => navigate('/signin')}>
              Login
            </button>
            <button className="navbar-btn-cta" id="btn-get-started" onClick={() => navigate('/signup')}>
              Get Started <span>→</span>
            </button>
          </>
        )}
      </div>
    </nav>
  );
};

export default LandingNavbar;


