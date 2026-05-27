import React, { useState, useEffect } from 'react';

const DocumentsView = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [documents, setDocuments] = useState([
    { id: 'SYS-8902', name: 'Q3_Financial_Report.pdf', size: '2.4MB', date: '2026-05-27', status: 'INDEXED', url: '#' }
  ]);
  const [error, setError] = useState('');

  useEffect(() => {
    // Trigger entrance animation for new layout
    const elements = document.querySelectorAll('.dash-body .animate-on-load');
    elements.forEach((el, index) => {
      setTimeout(() => {
        el.classList.add('fade-in-up');
      }, index * 100);
    });
  }, []);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const processUpload = (file) => {
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    setError('');

    // Simulate an aggressive hacker-style upload
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 15) + 5;
      if (progress > 100) progress = 100;
      setUploadProgress(progress);

      if (progress === 100) {
        clearInterval(interval);
        setTimeout(() => {
          const newDoc = {
            id: `SYS-${Math.floor(Math.random() * 9000) + 1000}`,
            name: file.name,
            size: `${(file.size / (1024 * 1024)).toFixed(2)}MB`,
            date: new Date().toISOString().split('T')[0],
            status: 'INDEXED',
            url: '#'
          };
          setDocuments(prev => [newDoc, ...prev]);
          setUploading(false);
        }, 500);
      }
    }, 200);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      processUpload(files[0]);
    }
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      processUpload(files[0]);
    }
  };

  return (
    <main className="dash-body" style={{ position: 'relative', overflow: 'hidden', minHeight: '100vh' }}>
      
      {/* ── MASSIVE CRAZY BACKGROUND ── */}
      <div className="extreme-bg-text glitch-hover" style={{ fontSize: '20vw', top: '15%', left: '50%', opacity: 0.1, zIndex: 0 }}>UPLINK</div>
      <div className="extreme-bg-text" style={{ fontSize: '15vw', top: '40%', left: '20%', opacity: 0.05, color: 'var(--accent)', zIndex: 0 }}>PROTOCOL</div>
      <div className="abstract-glow-orb" style={{ top: '10%', left: '50%', width: '800px', height: '800px', filter: 'blur(150px)', opacity: 0.1, background: 'var(--accent)', zIndex: 0, transform: 'translateX(-50%)' }}></div>
      <div className="abstract-glow-orb" style={{ bottom: '-10%', right: '-10%', width: '600px', height: '600px', filter: 'blur(200px)', opacity: 0.05, background: '#ff0055', zIndex: 0 }}></div>

      <div style={{ position: 'relative', zIndex: 10 }}>
        {/* ── EXTREME SCANNER ZONE ── */}
        <section className="doc-scanner-section animate-on-load">
          <div className="scanner-container">
            <div 
              className={`scanner-dropzone ${isDragging ? 'drag-active' : ''} ${uploading ? 'uploading' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {/* Radar Rings */}
              <div className="radar-ring ring-1"></div>
              <div className="radar-ring ring-2"></div>
              <div className="radar-ring ring-3" style={{ width: '700px', height: '700px', borderStyle: 'dotted' }}></div>
              
              {/* Content */}
              <div className="scanner-content">
                {uploading ? (
                  <div className="upload-progress-hud">
                    <div className="hud-percentage" style={{ fontSize: '48px', fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--accent)', textShadow: '0 0 20px var(--accent)' }}>
                      {uploadProgress}%
                    </div>
                    <div className="hud-spinner"></div>
                    <div className="hud-status">UPLOADING DATA PACKETS...</div>
                  </div>
                ) : (
                  <>
                    <svg className="scanner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="16"></line>
                      <line x1="8" y1="12" x2="16" y2="12"></line>
                    </svg>
                    <h2 className="scanner-title glitch-hover">UPLINK PORTAL</h2>
                    <p className="scanner-sub">DROP PDF OR CLICK TO INITIALIZE</p>
                    <label className="scanner-btn">
                      INITIALIZE SEQUENCE
                      <input 
                        type="file" 
                        hidden 
                        accept="application/pdf"
                        onChange={handleFileChange}
                        disabled={uploading}
                      />
                    </label>
                  </>
                )}
              </div>
              
              {/* Scan Line Overlay */}
              <div className="scanner-laser"></div>
              
              {/* Heavy Grid Pattern Inside Scanner */}
              <div className="scanner-bg-grid"></div>
            </div>
          </div>
        </section>

        {/* ── ERROR MESSAGE ── */}
        {error && (
          <div className="doc-error-hud animate-on-load" style={{ animationDelay: '0.1s' }}>
            <span className="error-badge">ERROR</span> {error}
          </div>
        )}

        {/* ── MASONRY DECK ── */}
        <section className="doc-masonry-section animate-on-load" style={{ animationDelay: '0.2s' }}>
          <div className="masonry-header">
            <div className="hud-barcode"></div>
            <span className="masonry-title">SECURED DATA DECK</span>
            <span className="hud-divider">|</span>
            <span className="neon-text">{documents.length} FILES</span>
          </div>

          <div className="doc-masonry-deck">
            {documents.map(doc => (
              <div key={doc.id} className="masonry-slate">
                <div className="slate-top">
                  <span className="slate-id">{doc.id}</span>
                  <span className={`slate-status ${doc.status === 'ERROR' ? 'error' : 'ok'}`}>{doc.status}</span>
                </div>
                
                <div className="slate-body">
                  <h3 className="slate-name" title={doc.name}>{doc.name}</h3>
                  <p className="slate-meta">{doc.size} {'//'} {doc.date}</p>
                </div>

                <div className="slate-actions">
                  <a href={doc.url} className="action-btn view">VIEW</a>
                  <button className="action-btn process">PROCESS</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
};

export default DocumentsView;
