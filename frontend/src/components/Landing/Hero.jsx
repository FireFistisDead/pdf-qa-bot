import React, { useEffect } from 'react';
import './Hero.css';

const Hero = () => {
  useEffect(() => {
    // Add staggered entrance animations
    const elements = document.querySelectorAll('.animate-on-load');
    elements.forEach((el, index) => {
      setTimeout(() => {
        el.classList.add('fade-in-up');
      }, index * 100);
    });
  }, []);

  return (
    <section className="hero">
      {/* Background & Ambiance */}
      <div className="hero-grid"></div>
      <div className="hero-glow-core"></div>
      <div className="hero-glow-accent"></div>

      {/* Decorative Floating Elements */}
      <div className="decor-group">
        <div className="decor-cross c1"></div>
        <div className="decor-cross c2"></div>
        <div className="decor-cross c3"></div>
        <div className="decor-dot d1"></div>
        <div className="decor-dot d2"></div>
        <div className="decor-dot d3"></div>
      </div>

      <div className="hero-container">
        {/* Left: Copy & CTAs */}
        <div className="hero-content">
          <div className="hero-tag animate-on-load">
            <span className="tag-pulse"></span>
            <span className="tag-text">DOCUMIND ENGINE v2.0</span>
          </div>

          <h1 className="hero-title animate-on-load">
            <span className="title-line lime-glow glow-hover">CHAT</span>
            <span className="title-line white-text glow-hover">WITH PDFS</span>
          </h1>

          <div className="hero-subtitle animate-on-load">
            <p className="subtitle-text text-hover-effect">
              Transform static documents into interactive intelligence.
            </p>
            <p className="subtitle-text text-hover-effect">
              Extract insights instantly using state-of-the-art RAG architecture.
            </p>
          </div>

          <div className="hero-actions animate-on-load">
            <button className="btn-primary">
              <span className="btn-text">GET STARTED</span>
              <span className="btn-glare"></span>
            </button>
            <button className="btn-secondary">
              <span className="btn-text">EXPLORE API</span>
              <div className="btn-border-tracer"></div>
            </button>
          </div>
        </div>

        {/* Right: 3D Interface Mockups (The "Text Boxes") */}
        <div className="hero-visual animate-on-load" style={{ animationDelay: '0.4s' }}>
          <div className="scene-3d">
            
            {/* Box 1: The PDF Document */}
            <div className="glass-panel panel-pdf">
              <div className="panel-header">
                <div className="mac-dots">
                  <i></i><i></i><i></i>
                </div>
                <div className="panel-title">research_paper.pdf</div>
              </div>
              <div className="panel-body">
                <h3 className="doc-title text-hover-effect">Abstract</h3>
                <p className="doc-text">
                  Retrieval-Augmented Generation (<span className="highlight-lime text-hover-effect">RAG</span>) represents a paradigm shift in information retrieval. 
                  By connecting foundational models to <span className="highlight-white text-hover-effect">external vector databases</span>, we achieve zero-hallucination outputs.
                </p>
                <div className="doc-skeleton">
                  <div className="skel-line w-100"></div>
                  <div className="skel-line w-80"></div>
                  <div className="skel-line w-90"></div>
                </div>
              </div>
              {/* Glowing anchor point */}
              <div className="node-anchor node-a"></div>
            </div>

            {/* Box 2: The AI Chat Interface */}
            <div className="glass-panel panel-chat">
              <div className="panel-header">
                <div className="panel-title lime-text">DocuMind AI</div>
                <div className="status-indicator"></div>
              </div>
              <div className="panel-body chat-container">
                <div className="chat-bubble user-bubble hover-lift">
                  What is the main advantage of RAG?
                </div>
                <div className="chat-bubble ai-bubble hover-lift">
                  <span className="ai-icon">✦</span>
                  <p>Based on the document, the main advantage is achieving <strong>zero-hallucination outputs</strong> by connecting to external vector databases.</p>
                </div>
                <div className="chat-input-mock">
                  <span>Ask a follow up...</span>
                  <div className="send-btn"></div>
                </div>
              </div>
            </div>

            {/* Huge Background Typography to fill empty space */}
            <div className="bg-typography">RAG ENGINE</div>
          </div>
        </div>
      </div>

      {/* Bottom Data Bar */}
      <div className="hero-data-bar animate-on-load" style={{ animationDelay: '0.6s' }}>
        <div className="data-col">
          <div className="data-value">500<span className="lime-text">+</span></div>
          <div className="data-label">DOCS PROCESSED</div>
        </div>
        <div className="data-col">
          <div className="data-value">12<span className="lime-text">+</span></div>
          <div className="data-label">SUPPORTED FORMATS</div>
        </div>
        <div className="data-col active-col">
          <div className="data-value">&lt; 2s</div>
          <div className="data-label">QUERY LATENCY</div>
          <div className="active-glow"></div>
        </div>
        <div className="data-col">
          <div className="data-value">∞</div>
          <div className="data-label">KNOWLEDGE BASE</div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
