import React from 'react';
import './Auth.css';

const AuthLayout = ({ children }) => {
  return (
    <div className="auth-container">
      {/* Background Grid */}
      <div className="auth-grid-bg"></div>

      {/* Left Side: Form Area */}
      <div className="auth-form-side">
        <div className="auth-form-wrapper">
          <a href="/" className="auth-logo">
            <div className="auth-logo-icon">D</div> DOCUMIND
          </a>
          
          {children}

          <div className="auth-footer">
            Protected by Local-First Encryption
          </div>
        </div>
      </div>

      {/* Right Side: Hero Visual Replica */}
      <div className="auth-visual-side">
        {/* Glows and Decor to make it less plain */}
        <div className="hero-glow-core" style={{ opacity: 0.5 }}></div>
        <div className="hero-glow-accent" style={{ opacity: 0.3 }}></div>
        
        <div className="decor-group">
          <div className="decor-cross c1"></div>
          <div className="decor-cross c2"></div>
          <div className="decor-cross c3"></div>
          <div className="decor-dot d1"></div>
          <div className="decor-dot d2"></div>
          <div className="decor-dot d3"></div>
        </div>

        <div className="auth-scene-container">
          <div className="scene-3d auth-scene-3d">
            
            {/* Box 1: The Secure Node */}
            <div className="glass-panel panel-pdf" style={{ width: '300px', height: '360px' }}>
              <div className="panel-header">
                <div className="mac-dots">
                  <i></i><i></i><i></i>
                </div>
                <div className="panel-title">SYSTEM.STATUS</div>
              </div>
              <div className="panel-body">
                <h3 className="doc-title text-hover-effect" style={{ color: 'var(--accent)' }}>SECURE_MODE: ON</h3>
                <p className="doc-text" style={{ fontSize: '13px', lineHeight: '1.6' }}>
                  <span className="highlight-lime text-hover-effect">All neural nodes</span> are operating strictly within local constraints. 
                  Zero external API calls detected.
                </p>
                <div className="doc-skeleton">
                  <div className="skel-line w-100"></div>
                  <div className="skel-line w-80"></div>
                  <div className="skel-line w-90"></div>
                </div>
              </div>
            </div>

            {/* Box 2: The Data Store */}
            <div className="glass-panel panel-chat" style={{ width: '280px', height: '300px', bottom: '0%', right: '0%' }}>
              <div className="panel-header">
                <div className="panel-title lime-text">VECTOR.STORE</div>
                <div className="status-indicator"></div>
              </div>
              <div className="panel-body chat-container">
                <div className="chat-bubble user-bubble hover-lift">
                  Where is my data stored?
                </div>
                <div className="chat-bubble ai-bubble hover-lift">
                  <span className="ai-icon">✦</span>
                  <p>Processing and storing document embeddings <strong>entirely on your local hardware</strong>.</p>
                </div>
                <div className="chat-input-mock">
                  <span>Absolute privacy.</span>
                  <div className="send-btn"></div>
                </div>
              </div>
            </div>

            <div className="bg-typography" style={{ fontSize: '90px' }}>SECURE</div>
          </div>
        </div>

        {/* Bottom UI wrapper to prevent overlap */}
        <div className="auth-bottom-ui">
          {/* Data Bar */}
          <div className="auth-data-bar">
            <div className="auth-data-col">
              <span className="auth-data-val">2s</span>
              <span className="auth-data-lbl">QUERY LATENCY</span>
            </div>
            <div className="auth-data-col">
              <span className="auth-data-val" style={{ color: 'var(--accent)' }}>100%</span>
              <span className="auth-data-lbl">LOCAL PRIVACY</span>
            </div>
            <div className="auth-data-col">
              <span className="auth-data-val">0</span>
              <span className="auth-data-lbl">EXTERNAL CALLS</span>
            </div>
          </div>

          {/* Diagonal Marquee */}
          <div className="marquee-band">
          <div className="marquee-content">
            <span>ZERO HALLUCINATION</span>
            <span>100% LOCAL PRIVACY</span>
            <span>INFINITE CONTEXT</span>
            <span>NO DATA SHARING</span>
            <span>ZERO HALLUCINATION</span>
            <span>100% LOCAL PRIVACY</span>
            <span>INFINITE CONTEXT</span>
            <span>NO DATA SHARING</span>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
