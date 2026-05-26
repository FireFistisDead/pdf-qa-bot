import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabaseClient';
import './Navbar.css';

const LandingNavbar = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

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
            <div style={{ position: 'relative' }}>
              <button 
                onClick={() => supabase.auth.signOut()}
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
                title="Sign Out"
              >
                {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
              </button>
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
