import React from 'react';
import './Features.css';

const Features = () => {
  return (
    <section className="features-section section-wrap" id="features">
      <div className="features-top-row">
        <div className="features-header">
          <span className="tag-accent">Core Architecture</span>
          <h2 className="display-lg features-title">
            Engineered for <span className="lime-text">Precision</span>.
          </h2>
          <p className="features-subtitle text-hover-effect">
            DocuMind leverages state-of-the-art embedding models to transform static PDFs into interactive, conversational knowledge bases.
          </p>
        </div>

        {/* Decorative Visual to fill empty space */}
        <div className="features-header-visual">
          <div className="rag-terminal">
            <div className="terminal-header">
              <span className="term-dot close"></span>
              <span className="term-dot min"></span>
              <span className="term-dot max"></span>
              <span className="terminal-title">rag_pipeline.sh</span>
            </div>
            <div className="terminal-body">
              <p className="term-line"><span className="term-prompt">&gt;</span> embed_document("annual_report.pdf")</p>
              <p className="term-line term-success">[✓] 124 pages chunked & vectorized</p>
              <p className="term-line"><span className="term-prompt">&gt;</span> query_faiss("revenue growth")</p>
              <p className="term-line term-success">[✓] Retrieved 4 relevant contexts</p>
              <p className="term-line"><span className="term-prompt">&gt;</span> generate_response()</p>
              <p className="term-line"><span className="term-cursor"></span></p>
            </div>
          </div>
        </div>
      </div>

      <div className="bento-grid">
        {/* Large Card: Vector Search */}
        <div className="bento-card card-large glass-panel glow-hover">
          <div className="card-bg-gradient blue"></div>
          <div className="card-content">
            <div className="card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 7V17C4 19.2091 7.58172 21 12 21C16.4183 21 20 19.2091 20 17V7M4 7C4 9.20914 7.58172 11 12 11C16.4183 11 20 9.20914 20 7M4 7C4 4.79086 7.58172 3 12 3C16.4183 3 20 4.79086 20 7M12 11V21" />
              </svg>
            </div>
            <h3 className="card-title">Semantic Vector Search</h3>
            <p className="card-text text-hover-effect">
              We don't just match keywords. We map paragraphs into high-dimensional vector space, understanding context, nuance, and intent perfectly.
            </p>
            
            {/* Mockup graphic inside card */}
            <div className="card-graphic">
              <div className="graphic-db">
                <div className="db-layer"></div>
                <div className="db-layer active"></div>
                <div className="db-layer"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Small Card 1: Zero Hallucination */}
        <div className="bento-card card-small glass-panel glow-hover">
          <div className="card-bg-gradient lime"></div>
          <div className="card-content">
            <div className="card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" />
                <path d="M9 12L11 14L15 10" />
              </svg>
            </div>
            <h3 className="card-title">Zero-Hallucination RAG</h3>
            <p className="card-text text-hover-effect">
              Strictly grounded generation. If the answer isn't in your document, the AI won't invent it.
            </p>
          </div>
        </div>

        {/* Small Card 2: Instant Extraction */}
        <div className="bento-card card-small glass-panel glow-hover">
          <div className="card-bg-gradient purple"></div>
          <div className="card-content">
            <div className="card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" />
              </svg>
            </div>
            <h3 className="card-title">Intelligent Summarization</h3>
            <p className="card-text text-hover-effect">
              Automatically generate concise, bullet-style summaries from your retrieved document context with a single click.
            </p>
          </div>
        </div>

        {/* Large Card: Developer API */}
        <div className="bento-card card-large glass-panel glow-hover">
          <div className="card-bg-gradient blue"></div>
          <div className="card-content">
            <div className="card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M8 9L3 12L8 15M16 9L21 12L16 15M14 4L10 20" />
              </svg>
            </div>
            <h3 className="card-title">100% Local & Private</h3>
            <p className="card-text text-hover-effect">
              Your documents never leave your machine. Our 3-tier architecture runs Hugging Face embeddings and LLM generation entirely locally on your hardware.
            </p>
            <div className="card-graphic">
              <div className="code-block" style={{ marginTop: '24px', padding: '16px', background: 'rgba(0,0,0,0.4)', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)', width: '100%' }}>
                <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#888' }}>
                  <code>
                    <span style={{color: '#c8ff00'}}>$</span> docker-compose up -d<br/>
                    <span style={{color: '#27c93f'}}>✔</span> Container express-gateway Started  :4000<br/>
                    <span style={{color: '#27c93f'}}>✔</span> Container fastapi-rag     Started  :5000<br/>
                    <span style={{color: '#27c93f'}}>✔</span> Container react-frontend  Started  :3000<br/>
                    <br/>
                    <span style={{color: '#888'}}>Ready. Models cached locally in volume.</span>
                  </code>
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Features;
