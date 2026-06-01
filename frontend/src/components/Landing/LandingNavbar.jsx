import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabaseClient';
import './Navbar.css';

const LandingNavbar = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('');
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

   useEffect(() => {
    const sections = ['features', 'how-it-works', 'pricing', 'faq'];
    const observers = [];

    sections.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const observer = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveSection(id); },
        { threshold: 0.4 }
      );
      observer.observe(el);
      observers.push(observer);
    });

    return () => observers.forEach((o) => o.disconnect());
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
        <a href="#features" className={`navbar-link ${activeSection === 'features' ? 'active' : ''}`}>Features</a>
        <a href="#how-it-works" className={`navbar-link ${activeSection === 'how-it-works' ? 'active' : ''}`}>How It Works</a>
        <a href="#pricing" className={`navbar-link ${activeSection === 'pricing' ? 'active' : ''}`}>Pricing</a>
        <a href="#faq" className={`navbar-link ${activeSection === 'faq' ? 'active' : ''}`}>FAQ</a>
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
                        display: 'flex', alignItems: 'center', gap: '10px',
                        width: '100%', padding: '12px 16px',
                        background: 'transparent', border: 'none', color: '#ccc',
                        textAlign: 'left', cursor: 'pointer', fontSize: '14px',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#252525'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                      Dashboard
                    </button>
                    <button
                      onClick={() => { navigate('/workspace'); setDropdownOpen(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        width: '100%', padding: '12px 16px',
                        background: 'transparent', border: 'none', color: '#ccc',
                        textAlign: 'left', cursor: 'pointer', fontSize: '14px',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#252525'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      PDF Workspace
                    </button>
                    <div style={{ borderTop: '1px solid #333' }}>
                      <button
                        onClick={() => { supabase.auth.signOut(); setDropdownOpen(false); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '10px',
                          width: '100%', padding: '12px 16px',
                          background: 'transparent', border: 'none', color: '#ff4444',
                          textAlign: 'left', cursor: 'pointer', fontSize: '14px',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#2a1111'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                        Sign Out
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


