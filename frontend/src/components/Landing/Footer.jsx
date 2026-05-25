import React from 'react';
import './Footer.css';

const GithubIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
);

const TwitterIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"></path></svg>
);

const DiscordIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 5.5s-1.5-1-4-1.5c-.3.5-.5 1.5-.5 1.5-2-.3-3.5-.3-5.5 0 0 0-.2-1-.5-1.5-2.5.5-4 1.5-4 1.5-2.5 4.5-3 11.5-2.5 14.5 2.5 2 6.5 2 6.5 2l1.5-2s-1.5-.5-2-1.5c1 .5 2 1 3 1.5 2.5 1 5.5 1 8 0 1-.5 2-1 3-1.5-.5 1-2 1.5-2 1.5l1.5 2s4 0 6.5-2c.5-3 0-10-2.5-14.5z"></path><path d="M9.5 14c-.5 0-1-.5-1-1s.5-1 1-1 1 .5 1 1-.5 1-1 1z"></path><path d="M14.5 14c-.5 0-1-.5-1-1s.5-1 1-1 1 .5 1 1-.5 1-1 1z"></path></svg>
);

const Footer = () => {
  return (
    <footer className="footer-section">
      {/* Background Elements */}
      <div className="footer-bg-elements">
        <div className="footer-grid-overlay"></div>
        <div className="footer-ambient-mesh"></div>
        <div className="footer-watermark">DOCUMIND</div>
      </div>
      <div className="footer-grid">
        <div className="footer-brand">
          <div className="footer-logo">
            <span className="logo-icon-footer">D</span> DOCUMIND
          </div>
          <p className="brand-desc text-hover-effect">
            The open-source platform for fully private, locally-hosted LLM document intelligence. Run the pipeline on your own hardware.
          </p>
        </div>

        <div className="footer-links">
          <div className="link-column">
            <h4>Product</h4>
            <ul>
              <li><a href="#how-it-works">How it Works</a></li>
              <li><a href="#pricing">Pricing</a></li>
              <li><a href="#faq">FAQ</a></li>
              <li><a href="#/">Cloud API</a></li>
            </ul>
          </div>
          <div className="link-column">
            <h4>Resources</h4>
            <ul>
              <li><a href="#/">Documentation</a></li>
              <li><a href="#/">GitHub Repo</a></li>
              <li><a href="#/">API Reference</a></li>
              <li><a href="#/">Blog</a></li>
            </ul>
          </div>
          <div className="link-column">
            <h4>Company</h4>
            <ul>
              <li><a href="#/">About Us</a></li>
              <li><a href="#/">Careers</a></li>
              <li><a href="#/">Privacy Policy</a></li>
              <li><a href="#/">Terms of Service</a></li>
            </ul>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <p>© 2026 DocuMind. All rights reserved.</p>
        <div className="footer-socials">
          <a href="#/" className="social-icon"><GithubIcon /></a>
          <a href="#/" className="social-icon"><TwitterIcon /></a>
          <a href="#/" className="social-icon"><DiscordIcon /></a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
