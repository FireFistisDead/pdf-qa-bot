import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../services/supabaseClient';
import { useAuth } from '../../../contexts/AuthContext';

const DocumentsView = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [documents, setDocuments] = useState([]);
  const [error, setError] = useState('');
  const [processingDocs, setProcessingDocs] = useState({});

  // Fetch documents on load
  useEffect(() => {
    const fetchDocuments = async () => {
      if (!user) return;
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching documents:', error);
      } else if (data) {
        setDocuments(data);
      }
    };
    fetchDocuments();
  }, [user]);

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

  const processUpload = async (file) => {
    if (!file || !user) return;
    setUploading(true);
    setUploadProgress(0);
    setError('');

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Simulate the aggressive counting for UX, but bounded by actual upload
      setUploadProgress(100);

      // Get public URL or signed URL
      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      // Insert record into Supabase Database
      const newDoc = {
        user_id: user.id,
        custom_id: `SYS-${Math.floor(Math.random() * 9000) + 1000}`,
        name: file.name,
        size: `${(file.size / (1024 * 1024)).toFixed(2)}MB`,
        status: 'INDEXED',
        url: publicUrl
      };

      const { data: dbData, error: dbError } = await supabase
        .from('documents')
        .insert([newDoc])
        .select()
        .single();

      if (dbError) throw dbError;

      setDocuments(prev => [dbData, ...prev]);

    } catch (err) {
      console.error('Upload Error:', err);
      setError(err.message || 'Failed to initialize uplink.');
    } finally {
      setUploading(false);
    }
  };

  const handleProcess = async (docId) => {
    setProcessingDocs(prev => ({ ...prev, [docId]: 'indexing' }));

    // Simulate backend extraction and embedding generation (4s)
    setTimeout(async () => {
      // Update Supabase Database status — this is the source of truth
      const { error } = await supabase
        .from('documents')
        .update({ status: 'READY FOR CHAT' })
        .eq('id', docId);

      if (error) {
        console.error('Error updating document status:', error);
        setProcessingDocs(prev => ({ ...prev, [docId]: undefined }));
      } else {
        // Sync local documents array so UI updates immediately
        setDocuments(prevDocs => prevDocs.map(d =>
          d.id === docId ? { ...d, status: 'READY FOR CHAT' } : d
        ));
        setProcessingDocs(prev => ({ ...prev, [docId]: 'ready' }));
      }
    }, 4000);
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
            {documents.map(doc => {
              const isIndexing = processingDocs[doc.id] === 'indexing';
              const isReady = doc.status === 'READY FOR CHAT' || processingDocs[doc.id] === 'ready';

              return (
                <div key={doc.id} className="masonry-slate">
                  <div className="slate-top">
                    <span className="slate-id">{doc.custom_id || doc.id}</span>
                    <span className={`slate-status ${doc.status === 'ERROR' ? 'error' : isReady ? 'ready' : 'ok'}`}>
                      {isIndexing ? 'INDEXING...' : isReady ? 'READY FOR CHAT' : doc.status}
                    </span>
                  </div>
                  
                  <div className="slate-body">
                    <h3 className="slate-name" title={doc.name}>{doc.name}</h3>
                    <p className="slate-meta">{doc.size} {'//'} {doc.created_at ? new Date(doc.created_at).toISOString().split('T')[0] : 'Just now'}</p>
                  </div>

                  <div className="slate-actions">
                    <a href={doc.url} target="_blank" rel="noopener noreferrer" className="action-btn view">VIEW</a>
                    
                    {isReady ? (
                      <button 
                        className="action-btn process ready" 
                        style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}
                        onClick={() => navigate('/dashboard/chat', { state: { documentId: doc.id } })}
                      >
                        START CHAT
                      </button>
                    ) : (
                      <button 
                        className="action-btn process" 
                        disabled={isIndexing}
                        style={{ color: isIndexing ? 'var(--accent)' : '' }}
                        onClick={() => handleProcess(doc.id)}
                      >
                        {isIndexing ? 'INDEXING...' : 'PROCESS'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
};

export default DocumentsView;
