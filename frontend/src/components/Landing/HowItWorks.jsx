import React, { useState } from 'react';
import './HowItWorks.css';

const slides = [
  {
    id: '01',
    title: 'Document Ingestion',
    desc: 'Upload your PDFs securely. Our engine parses complex layouts, extracting raw text while preserving structural integrity.',
    visual: 'parsing'
  },
  {
    id: '02',
    title: 'Semantic Chunking',
    desc: 'Large documents are intelligently broken down into optimized, overlapping context windows to retain complete semantic meaning.',
    visual: 'chunking'
  },
  {
    id: '03',
    title: 'Neural Vectorization',
    desc: 'Chunks are processed through Hugging Face embedding models and indexed in a high-performance FAISS vector database.',
    visual: 'vector'
  },
  {
    id: '04',
    title: 'Grounded Generation',
    desc: 'When you ask a query, we retrieve the most relevant vectors and synthesize a zero-hallucination response instantly.',
    visual: 'generation'
  }
];

const HowItWorks = () => {
  const [active, setActive] = useState(0);

  const nextSlide = () => setActive((p) => (p + 1) % slides.length);
  const prevSlide = () => setActive((p) => (p - 1 + slides.length) % slides.length);

  const getSlideClass = (index) => {
    if (index === active) return 'slide-active';
    if (index === (active - 1 + slides.length) % slides.length) return 'slide-prev';
    if (index === (active + 1) % slides.length) return 'slide-next';
    return 'slide-hidden';
  };

  return (
    <section className="hiw-section section-wrap" id="how-it-works">
      {/* Background Elements to fill empty space */}
      <div className="hiw-bg-elements">
        <div className="hiw-grid-overlay"></div>
        <div className="hiw-glow glow-top"></div>
        <div className="hiw-glow glow-bottom"></div>
        <div className="hiw-glow glow-left"></div>
        <div className="hiw-glow glow-right"></div>
      </div>

      <div className="hiw-header">
        <span className="tag-accent">The Pipeline</span>
        <h2 className="display-lg">How It <span className="lime-text">Works</span>.</h2>
        <p className="hiw-subtitle">
          Discover how DocuMind transforms static PDFs into an interactive, zero-hallucination knowledge base in four seamless steps.
        </p>
      </div>
      
      <div className="carousel-wrapper">
        <button className="nav-btn nav-left" onClick={prevSlide}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>

        <div className="carousel-3d-container">
          {slides.map((slide, index) => (
            <button 
              type="button"
              key={slide.id} 
              className={`carousel-3d-slide ${getSlideClass(index)}`}
              style={{ background: 'transparent', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', display: 'block' }}
              onClick={() => setActive(index)}
            >
              <div className="slide-content-3d glass-panel">
                <div className="slide-number-bg">{slide.id}</div>
                
                <div className="slide-layout-split">
                  <div className="slide-text-section">
                    <h3 className="slide-title-3d">{slide.title}</h3>
                    <p className="slide-desc-3d text-hover-effect">{slide.desc}</p>
                    <div className="slide-tech-stack">
                      {slide.visual === 'parsing' && <><span className="tag">PDF.js</span><span className="tag">PyMuPDF</span></>}
                      {slide.visual === 'chunking' && <><span className="tag">LangChain</span><span className="tag">Token Splitter</span></>}
                      {slide.visual === 'vector' && <><span className="tag">FAISS</span><span className="tag">MiniLM-L6-v2</span></>}
                      {slide.visual === 'generation' && <><span className="tag">Flan-T5</span><span className="tag">Llama-3</span></>}
                    </div>
                  </div>
                  
                  <div className="slide-visual-section">
                    {slide.visual === 'parsing' && (
                      <div className="vis-parsing">
                        <div className="doc-page">
                          <div className="doc-line w-80"></div>
                          <div className="doc-line w-60"></div>
                          <div className="doc-line w-90"></div>
                          <div className="doc-line w-40"></div>
                          <div className="doc-line w-70"></div>
                          <div className="doc-scanner"></div>
                        </div>
                      </div>
                    )}
                    {slide.visual === 'chunking' && (
                      <div className="vis-chunking">
                        <div className="chunk c1">Segment 1: [0-500]</div>
                        <div className="chunk c2">Segment 2: [400-900]</div>
                        <div className="chunk c3">Segment 3: [800-1300]</div>
                      </div>
                    )}
                    {slide.visual === 'vector' && (
                      <div className="vis-vector">
                        <div className="node n1"></div>
                        <div className="node n2"></div>
                        <div className="node n3"></div>
                        <div className="node n4"></div>
                        <div className="node n5"></div>
                        <div className="v-line l1"></div>
                        <div className="v-line l2"></div>
                        <div className="v-line l3"></div>
                      </div>
                    )}
                    {slide.visual === 'generation' && (
                      <div className="vis-generation">
                        <div className="chat-bubble user">Summarize the findings</div>
                        <div className="chat-bubble ai pulse-glow">Based on the provided context...</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        <button className="nav-btn nav-right" onClick={nextSlide}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

      <div className="carousel-progress">
        {slides.map((_, i) => (
          <button 
            type="button"
            key={i} 
            aria-label={`Slide ${i + 1}`}
            className={`progress-dot ${i === active ? 'active' : ''}`}
            style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
            onClick={() => setActive(i)}
          />
        ))}
      </div>
    </section>
  );
};

export default HowItWorks;
