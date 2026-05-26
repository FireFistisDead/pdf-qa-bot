import React from 'react';

const KnowledgeView = () => {
  return (
    <div className="dash-hero-extreme" style={{ minHeight: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div className="extreme-bg-text">KNOWLEDGE</div>
      
      <div className="hero-content-crazy" style={{ textAlign: 'center', margin: '0 auto', alignItems: 'center' }}>
        <div className="status-badge-glitch" style={{ alignSelf: 'center' }}>
          <div className="status-dot-blink"/>
          MODULE OFFLINE
        </div>
        <h1 className="hero-title-crazy">
          KNOWLEDGE <span className="neon-text glow-hover">MODULE</span>
        </h1>
        <p className="hero-sub-crazy text-hover-effect" style={{ textAlign: 'center' }}>
          THIS SECTOR IS CURRENTLY UNDER CONSTRUCTION. CHECK BACK LATER.
        </p>
      </div>
    </div>
  );
};

export default KnowledgeView;
