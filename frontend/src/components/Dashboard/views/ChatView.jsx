import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../../services/supabaseClient';
import { askStream } from '../../../services/ragService';
import toast from 'react-hot-toast';
import './ChatView.css';

const ChatView = () => {
  const location = useLocation();
  const [documents, setDocuments] = useState([]);
  const [activeDoc, setActiveDoc] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [currentStream, setCurrentStream] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [msgCount, setMsgCount] = useState(0);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if (location.state?.documentId) {
        const doc = (data || []).find(d => d.id === location.state.documentId);
        if (doc) setActiveDoc(doc);
      } else if (data && data.length > 0) {
        setActiveDoc(prev => prev || data[0]);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load documents');
    }
  }, [location.state?.documentId]);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  useEffect(() => {
    if (!activeDoc) { setMessages([]); return; }
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('document_id', activeDoc.id)
          .order('created_at', { ascending: true });
        if (error) throw error;
        setMessages(data || []);
        setMsgCount((data || []).length);
      } catch (err) {
        toast.error('Failed to load chat history');
      }
    };
    load();
  }, [activeDoc]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentStream]);

  // Auto-grow textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + 'px';
    }
  }, [inputText]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || !activeDoc || isTyping) return;
    const userMsg = { role: 'user', content: inputText };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);
    setCurrentStream('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.from('chat_messages').insert({
        user_id: session.user.id,
        document_id: activeDoc.id,
        role: 'user',
        content: userMsg.content,
      });

      let full = '';
      askStream(
        activeDoc.session_id,
        activeDoc.session_secret,
        userMsg.content,
        (text) => { full += text; setCurrentStream(full); },
        async () => {
          setIsTyping(false);
          setCurrentStream('');
          setMessages(prev => [...prev, { role: 'assistant', content: full }]);
          setMsgCount(c => c + 2);
          await supabase.from('chat_messages').insert({
            user_id: session.user.id,
            document_id: activeDoc.id,
            role: 'assistant',
            content: full,
          });
        },
        (err) => { setIsTyping(false); setCurrentStream(''); toast.error(err); }
      );
    } catch (err) {
      setIsTyping(false);
      setCurrentStream('');
      toast.error('Failed to send message');
    }
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getDocInitials = (name = '') => name.replace(/\.pdf$/i, '').slice(0, 2).toUpperCase() || 'DC';

  return (
    <div className="chat-root">
      {/* ── ANIMATED BG ── */}
      <div className="chat-bg-grid" />
      <div className="chat-bg-orb chat-bg-orb-1" />
      <div className="chat-bg-orb chat-bg-orb-2" />

      {/* ── LEFT: DOCUMENT SELECTOR PANEL ── */}
      <aside className={`chat-sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
        <div className="chat-sidebar-header">
          <div className="csb-title-row">
            <div className="csb-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            {sidebarOpen && <span className="csb-title">NEURAL_DOCS</span>}
          </div>
          <button className="csb-toggle" onClick={() => setSidebarOpen(p => !p)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              {sidebarOpen
                ? <polyline points="15 18 9 12 15 6" />
                : <polyline points="9 18 15 12 9 6" />}
            </svg>
          </button>
        </div>

        {sidebarOpen && (
          <div className="csb-count-badge">
            <span className="csb-count-num">{documents.length}</span>
            <span className="csb-count-lbl">STREAMS READY</span>
          </div>
        )}

        <div className="csb-doc-list">
          {documents.length === 0 ? (
            sidebarOpen && (
              <div className="csb-empty">
                <div className="csb-empty-icon">⚡</div>
                <p>No documents ready.<br/>Process a PDF first.</p>
              </div>
            )
          ) : (
            documents.map((doc) => {
              const isActive = activeDoc?.id === doc.id;
              return (
                <button
                  key={doc.id}
                  className={`csb-doc-item ${isActive ? 'csb-doc-active' : ''}`}
                  onClick={() => setActiveDoc(doc)}
                  title={doc.name}
                >
                  <div className="csb-doc-avatar" style={{ background: isActive ? 'var(--accent)' : 'rgba(255,255,255,0.05)' }}>
                    <span style={{ color: isActive ? '#000' : '#fff' }}>{getDocInitials(doc.name)}</span>
                    {isActive && <div className="csb-doc-avatar-ping" />}
                  </div>
                  {sidebarOpen && (
                    <div className="csb-doc-info">
                      <div className="csb-doc-name">{doc.name}</div>
                      <div className="csb-doc-meta">
                        <span className="csb-doc-size">{doc.size || '—'}</span>
                        <span className="csb-status-pill">READY</span>
                      </div>
                    </div>
                  )}
                  {isActive && <div className="csb-active-bar" />}
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ── RIGHT: CHAT PANEL ── */}
      <div className="chat-panel">
        {/* TOP BAR */}
        <div className="chat-topbar">
          <div className="chat-topbar-left">
            {activeDoc ? (
              <>
                <div className="chat-doc-badge">
                  <div className="cdb-dot" />
                  <span className="cdb-name">{activeDoc.name}</span>
                </div>
                <div className="chat-sep">·</div>
                <div className="chat-meta-chip">
                  <span>{msgCount} MESSAGES</span>
                </div>
              </>
            ) : (
              <div className="chat-meta-chip">SELECT A DOCUMENT TO BEGIN</div>
            )}
          </div>
          <div className="chat-topbar-right">
            <div className="chat-sys-status">
              <div className={`cstatus-dot ${isTyping ? 'cstatus-thinking' : 'cstatus-ready'}`} />
              <span>{isTyping ? 'AI PROCESSING...' : 'SYS_READY'}</span>
            </div>
          </div>
        </div>

        {/* MESSAGE FEED */}
        <div className="chat-feed">
          {!activeDoc ? (
            <div className="chat-idle-state">
              <div className="cis-glyph">
                <svg viewBox="0 0 80 80" fill="none">
                  <circle cx="40" cy="40" r="38" stroke="rgba(200,255,0,0.15)" strokeWidth="1" strokeDasharray="4 4"/>
                  <circle cx="40" cy="40" r="28" stroke="rgba(200,255,0,0.1)" strokeWidth="1"/>
                  <circle cx="40" cy="40" r="6" fill="rgba(200,255,0,0.3)"/>
                  <circle cx="40" cy="40" r="6" fill="rgba(200,255,0,0.3)" className="chat-idle-pulse"/>
                </svg>
              </div>
              <div className="cis-label">AWAITING_NEURAL_LINK</div>
              <p className="cis-sub">← Select a document from the sidebar to begin interrogation</p>
              <div className="cis-hints">
                <div className="cis-hint">⌃ Ask about any content</div>
                <div className="cis-hint">⌃ Summarize sections</div>
                <div className="cis-hint">⌃ Extract key insights</div>
              </div>
            </div>
          ) : messages.length === 0 && !isTyping && !currentStream ? (
            <div className="chat-idle-state">
              <div className="cis-glyph cis-glyph-active">
                <svg viewBox="0 0 80 80" fill="none">
                  <circle cx="40" cy="40" r="38" stroke="rgba(200,255,0,0.3)" strokeWidth="1" strokeDasharray="4 4" className="cis-spin"/>
                  <circle cx="40" cy="40" r="28" stroke="rgba(200,255,0,0.15)" strokeWidth="1"/>
                  <circle cx="40" cy="40" r="6" fill="var(--accent)"/>
                </svg>
              </div>
              <div className="cis-label" style={{ color: 'var(--accent)' }}>LINK_ESTABLISHED</div>
              <p className="cis-sub">Neural link active — <strong style={{ color: '#fff' }}>{activeDoc.name}</strong></p>
              <p className="cis-sub" style={{ marginTop: 4, opacity: 0.5 }}>Start your interrogation below</p>
              <div className="cis-hints">
                <div className="cis-hint" onClick={() => setInputText('Summarize this document in 3 bullet points')}>→ Summarize in 3 points</div>
                <div className="cis-hint" onClick={() => setInputText('What are the key findings?')}>→ Key findings</div>
                <div className="cis-hint" onClick={() => setInputText('What are the main conclusions?')}>→ Main conclusions</div>
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, idx) => (
                <div key={idx} className={`cmsg ${msg.role === 'user' ? 'cmsg-user' : 'cmsg-ai'}`}>
                  <div className="cmsg-avatar">
                    {msg.role === 'user'
                      ? <span>U</span>
                      : <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="M5 8h6M8 5v6" strokeWidth="1.5" stroke="currentColor"/></svg>
                    }
                  </div>
                  <div className="cmsg-body">
                    <div className="cmsg-header-row">
                      <span className="cmsg-sender">{msg.role === 'user' ? 'YOU' : 'AI_SYSTEM'}</span>
                      <span className="cmsg-time">{formatTime(msg.created_at)}</span>
                    </div>
                    <div className="cmsg-bubble">
                      {msg.content.split('\n').filter(Boolean).map((line, i) => (
                        <p key={i}>{line}</p>
                      ))}
                    </div>
                  </div>
                </div>
              ))}

              {(isTyping || currentStream) && (
                <div className="cmsg cmsg-ai">
                  <div className="cmsg-avatar cmsg-avatar-thinking">
                    <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12">
                      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M5 8h6M8 5v6" strokeWidth="1.5" stroke="currentColor"/>
                    </svg>
                  </div>
                  <div className="cmsg-body">
                    <div className="cmsg-header-row">
                      <span className="cmsg-sender">AI_SYSTEM</span>
                      <span className="cmsg-time cmsg-streaming-tag">● STREAMING</span>
                    </div>
                    <div className="cmsg-bubble cmsg-bubble-streaming">
                      {currentStream ? (
                        <>
                          {currentStream.split('\n').filter(Boolean).map((line, i) => (
                            <p key={i}>{line}</p>
                          ))}
                          <span className="cmsg-cursor" />
                        </>
                      ) : (
                        <div className="cmsg-thinking">
                          <span /><span /><span />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* INPUT ZONE */}
        <div className="chat-input-zone">
          <div className="chat-input-decoration">
            <div className="cid-corner cid-tl" />
            <div className="cid-corner cid-tr" />
          </div>
          <form className="chat-input-form" onSubmit={handleSend}>
            <div className="chat-input-prefix">
              <span className="cip-prompt">&gt;_</span>
            </div>
            <textarea
              ref={textareaRef}
              className="chat-input-field"
              placeholder={activeDoc ? `Interrogate ${activeDoc.name}...` : 'Select a document first...'}
              value={inputText}
              rows={1}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
              disabled={!activeDoc || isTyping}
            />
            <div className="chat-input-actions">
              <span className="cia-hint">SHIFT+ENTER for newline</span>
              <button
                type="submit"
                className={`cia-send ${isTyping ? 'cia-send-busy' : ''}`}
                disabled={!activeDoc || isTyping || !inputText.trim()}
              >
                {isTyping ? (
                  <span className="cia-loader"><span/><span/><span/></span>
                ) : (
                  <>
                    <span>TRANSMIT</span>
                    <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                      <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/>
                    </svg>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ChatView;
