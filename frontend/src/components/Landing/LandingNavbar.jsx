import React from 'react';
import './Navbar.css';

const LandingNavbar = () => {
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
        <button className="navbar-btn-login" id="btn-login">
          Login
        </button>
        <button className="navbar-btn-cta" id="btn-get-started" onClick={() => window.location.href = '/'}>
          Get Started <span>→</span>
        </button>
      </div>
    </nav>
  );
};

export default LandingNavbar;
