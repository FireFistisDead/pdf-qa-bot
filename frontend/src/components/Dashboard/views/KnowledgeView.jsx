import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../services/supabaseClient';
import { mapKnowledgeGapsApi } from '../../../services/api';
import toast from 'react-hot-toast';
import './KnowledgeView.css';

const KnowledgeView = () => {
  const [documents, setDocuments] = useState([]);
  const [activeDoc, setActiveDoc] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [gaps, setGaps] = useState([]);
  const [hasScanned, setHasScanned] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchDocuments = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('status', 'READY FOR CHAT')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setDocuments(data || []);
      if (data && data.length > 0) setActiveDoc(data[0]);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load documents');
    }
  }, []);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  const handleScan = async () => {
    if (!activeDoc) return;
    setIsScanning(true);
    setHasScanned(false);
    try {
      const result = await mapKnowledgeGapsApi(
        activeDoc.session_id,
        activeDoc.session_secret,
        activeDoc.id
      );
      setGaps(result || []);
      setHasScanned(true);
      toast.success('Knowledge mapping complete!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to map knowledge gaps');
    } finally {
      setIsScanning(false);
    }
  };

  const docCount = documents.length;
  const gapCount = hasScanned ? gaps.length : '—';
  const pagesScanned = hasScanned && activeDoc ? (activeDoc.page_count || '—') : '—';

  return (
    <div className="kv-wrap">
      {/* ── BACKGROUND ── */}
      <div className="kv-grid-bg" />
      <div className="kv-orb kv-orb-1" />
      <div className="kv-orb kv-orb-2" />
      <div className="kv-orb kv-orb-3" />
      <div className="kv-noise" />
      <div className="kv-decor-x kv-x1" />
      <div className="kv-decor-x kv-x2" />
      <div className="kv-decor-x kv-x3" />
      <div className="kv-decor-x kv-x4" />
      <div className="kv-ring kv-ring-1" />
      <div className="kv-ring kv-ring-2" />

      <div className="kv-inner">

        {/* ── HEADER ── */}
        <div className="kv-header kv-fade" style={{ animationDelay: '0s' }}>
          <div className="kv-header-left">
            <div className="kv-badge">
              <span className="kv-dot" />
              SYS.MAPPING_ACTIVE
            </div>
            <h1 className="kv-title">
              KNOWLEDGE<span className="kv-title-accent"> MODULE</span>
            </h1>
            <p className="kv-subtitle">
              Identify undefined domain concepts and map orphan terms across your documents.
            </p>
          </div>
          <div className="kv-header-stats">
            <div className="kv-stat-chip">
              <span className="kv-stat-val">{docCount}</span>
              <span className="kv-stat-lbl">DOCUMENTS</span>
            </div>
            <div className="kv-stat-chip">
              <span className="kv-stat-val">{gapCount}</span>
              <span className="kv-stat-lbl">GAPS FOUND</span>
            </div>
            <div className="kv-stat-chip">
              <span className="kv-stat-val">{pagesScanned}</span>
              <span className="kv-stat-lbl">PAGES</span>
            </div>
          </div>
        </div>

        {/* ── BENTO GRID ── */}
        <div className="kv-bento kv-fade" style={{ animationDelay: '0.1s' }}>

          {/* CELL 1 — Scanner */}
          <div className="kv-cell kv-cell-scanner">
            <div className="kv-cell-label">01 / SCANNER</div>
            <h2 className="kv-cell-title">Knowledge Gaps Analyzer</h2>
            <p className="kv-cell-desc">Select a document and run the neural scan to detect undefined domain concepts.</p>

            {docCount > 0 ? (
              <div className="kv-dropdown-wrap" ref={dropdownRef}>
                <div
                  className={`kv-dd-trigger ${isDropdownOpen ? 'open' : ''}`}
                  onClick={() => setIsDropdownOpen(o => !o)}
                >
                  <span className="kv-dd-file-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  </span>
                  <span className="kv-dd-text">{activeDoc ? activeDoc.name : 'Select a document…'}</span>
                  <span className={`kv-dd-caret ${isDropdownOpen ? 'open' : ''}`}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                  </span>
                </div>
                {isDropdownOpen && (
                  <div className="kv-dd-menu">
                    <div className="kv-dd-menu-inner">
                      {documents.map(doc => (
                        <div
                          key={doc.id}
                          className={`kv-dd-item ${activeDoc?.id === doc.id ? 'active' : ''}`}
                          onClick={() => { setActiveDoc(doc); setIsDropdownOpen(false); }}
                        >
                          <span className="kv-dd-item-icon">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>
                          </span>
                          <span className="kv-dd-item-name">{doc.name}</span>
                          {activeDoc?.id === doc.id && (
                            <span className="kv-dd-item-check">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="kv-no-docs">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                No documents ready. Upload a PDF first.
              </div>
            )}

            <button
              className="kv-scan-btn"
              onClick={handleScan}
              disabled={isScanning || docCount === 0}
            >
              {isScanning ? (
                <><span className="kv-spinner" /> SCANNING…</>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  INITIATE SCAN
                </>
              )}
            </button>
          </div>

          {/* CELL 2 — How it works */}
          <div className="kv-cell kv-cell-howto">
            <div className="kv-cell-label">02 / HOW IT WORKS</div>
            <div className="kv-steps">
              {[
                { n: '01', t: 'SELECT', d: 'Choose a document from your library' },
                { n: '02', t: 'SCAN', d: 'Neural engine vectorizes and maps all concepts' },
                { n: '03', t: 'ANALYZE', d: 'Orphan terms without definitions are flagged' },
                { n: '04', t: 'REVIEW', d: 'Browse gaps and fill knowledge holes' },
              ].map(s => (
                <div className="kv-step" key={s.n}>
                  <span className="kv-step-n">{s.n}</span>
                  <div>
                    <div className="kv-step-title">{s.t}</div>
                    <div className="kv-step-desc">{s.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CELL 3 — Status */}
          <div className="kv-cell kv-cell-status">
            <div className="kv-cell-label">03 / STATUS</div>
            <div className="kv-status-display">
              {isScanning ? (
                <>
                  <div className="kv-status-icon scanning"><span className="kv-spinner large" /></div>
                  <div className="kv-status-text">SCANNING</div>
                  <div className="kv-status-sub">Analyzing vector space…</div>
                </>
              ) : hasScanned ? (
                <>
                  <div className="kv-status-icon done">✓</div>
                  <div className="kv-status-text">COMPLETE</div>
                  <div className="kv-status-sub">{gaps.length} gaps identified</div>
                </>
              ) : (
                <>
                  <div className="kv-status-icon idle">◉</div>
                  <div className="kv-status-text">IDLE</div>
                  <div className="kv-status-sub">Awaiting scan command</div>
                </>
              )}
            </div>
          </div>

          {/* CELL 4 — Active doc info */}
          {activeDoc && (
            <div className="kv-cell kv-cell-docinfo">
              <div className="kv-cell-label">04 / ACTIVE DOCUMENT</div>
              <div className="kv-doc-name">{activeDoc.name}</div>
              <div className="kv-doc-meta">
                <span className="kv-doc-tag">READY FOR CHAT</span>
                {activeDoc.page_count && <span className="kv-doc-tag">{activeDoc.page_count} PAGES</span>}
                {activeDoc.size && <span className="kv-doc-tag">{activeDoc.size}</span>}
              </div>
            </div>
          )}
        </div>

        {/* ── RESULTS ── */}
        {(hasScanned || isScanning) && (
          <div className="kv-results-section kv-fade" style={{ animationDelay: '0.15s' }}>
            <div className="kv-results-header">
              <span className="kv-cell-label">05 / KNOWLEDGE GAPS</span>
              {hasScanned && <span className="kv-results-count">{gaps.length} TERMS FOUND</span>}
            </div>
            {isScanning ? (
              <div className="kv-loading-grid">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="kv-skeleton-card" style={{ animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
            ) : gaps.length === 0 ? (
              <div className="kv-no-gaps">
                <div className="kv-no-gaps-icon">✓</div>
                <p>No knowledge gaps detected</p>
                <span>This document appears to be comprehensive and well-defined.</span>
              </div>
            ) : (
              <div className="kv-gaps-grid">
                {gaps.map((gap, i) => (
                  <div key={i} className="kv-gap-card" style={{ animationDelay: `${i * 0.05}s` }}>
                    <div className="kv-gap-index">{String(i + 1).padStart(2, '0')}</div>
                    <div className="kv-gap-term">{gap.term}</div>
                    <div className="kv-gap-pages">
                      {(gap.pages || []).map(p => (
                        <span key={p} className="kv-page-tag">P.{p}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default KnowledgeView;
