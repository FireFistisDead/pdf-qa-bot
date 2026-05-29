import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../../services/supabaseClient';
import { askStream } from '../../../services/ragService';
import toast from 'react-hot-toast';

const ChatView = () => {
  const location = useLocation();
  const [documents, setDocuments] = useState([]);
  const [activeDoc, setActiveDoc] = useState(null);
  
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [currentStream, setCurrentStream] = useState('');
  
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchDocuments();
  }, []);

  useEffect(() => {
    if (activeDoc) {
      fetchMessages(activeDoc.id);
    } else {
      setMessages([]);
    }
  }, [activeDoc]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentStream]);

  const fetchDocuments = async () => {
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
      
      // Auto-select based on router state or first available
      if (location.state?.documentId) {
        const doc = data.find(d => d.id === location.state.documentId);
        if (doc) setActiveDoc(doc);
      } else if (data && data.length > 0 && !activeDoc) {
        setActiveDoc(data[0]);
      }
    } catch (error) {
      console.error('Error fetching chat documents:', error);
      toast.error('Failed to load documents');
    }
  };

  const fetchMessages = async (documentId) => {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('document_id', documentId)
        .order('created_at', { ascending: true });
        
      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast.error('Failed to load chat history');
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || !activeDoc) return;

    const userMessage = {
      role: 'user',
      content: inputText,
    };
    
    // Add to UI immediately
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsTyping(true);
    setCurrentStream('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Save user message to DB
      await supabase.from('chat_messages').insert({
        user_id: session.user.id,
        document_id: activeDoc.id,
        role: 'user',
        content: userMessage.content
      });

      // Call streaming backend
      let fullAssistantMessage = '';
      askStream(
        activeDoc.session_id,
        activeDoc.session_secret,
        userMessage.content,
        // onChunk
        (text) => {
          fullAssistantMessage += text;
          setCurrentStream(fullAssistantMessage);
        },
        // onDone
        async () => {
          setIsTyping(false);
          setCurrentStream('');
          
          const assistantMsg = { role: 'assistant', content: fullAssistantMessage };
          setMessages(prev => [...prev, assistantMsg]);
          
          // Save assistant message to DB
          await supabase.from('chat_messages').insert({
            user_id: session.user.id,
            document_id: activeDoc.id,
            role: 'assistant',
            content: fullAssistantMessage
          });
        },
        // onError
        (err) => {
          setIsTyping(false);
          setCurrentStream('');
          toast.error(err);
        }
      );
    } catch (error) {
      setIsTyping(false);
      setCurrentStream('');
      toast.error('Failed to send message');
    }
  };

  return (
    <div className="dash-hero-extreme" style={{ height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column', padding: 0 }}>
      <div className="chat-header-bar">
        <div className="chat-header-left">
          <div className="crazy-logo-box" style={{ width: 24, height: 24, fontSize: 10 }}>AI</div>
          <div className="logo-brand">SYS_CHAT</div>
        </div>
        
        <div className="chat-doc-selector">
          <select 
            className="doc-select-dropdown"
            value={activeDoc?.id || ''}
            onChange={(e) => {
              const doc = documents.find(d => d.id === e.target.value);
              setActiveDoc(doc);
            }}
            disabled={isTyping}
          >
            <option value="" disabled>Select a document stream...</option>
            {documents.map(doc => (
              <option key={doc.id} value={doc.id}>
                {doc.filename}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="chat-messages-area">
        {!activeDoc ? (
           <div className="chat-empty-state">
             <div className="status-badge-glitch"><div className="status-dot-blink"/>AWAITING CONTEXT</div>
             <p className="hero-sub-crazy" style={{marginTop: '20px'}}>Select a processed document to initiate neural link.</p>
           </div>
        ) : messages.length === 0 && !isTyping ? (
           <div className="chat-empty-state">
             <div className="status-badge-glitch" style={{color: 'var(--accent)', borderColor: 'var(--accent)'}}>
               <div className="status-dot-blink" style={{background: 'var(--accent)'}}/>
               LINK ESTABLISHED
             </div>
             <p className="hero-sub-crazy" style={{marginTop: '20px'}}>Ready to process inquiries regarding {activeDoc.filename}</p>
           </div>
        ) : (
          <>
            {messages.map((msg, idx) => (
              <div key={idx} className={`chat-message ${msg.role === 'user' ? 'chat-message-user' : 'chat-message-ai'}`}>
                <div className="chat-msg-label">{msg.role === 'user' ? 'YOU' : 'AI_SYSTEM'}</div>
                <div className="chat-msg-content">
                  {msg.content.split('\n').map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              </div>
            ))}
            
            {(isTyping || currentStream) && (
              <div className="chat-message chat-message-ai">
                <div className="chat-msg-label">AI_SYSTEM</div>
                <div className="chat-msg-content">
                  {currentStream ? (
                    currentStream.split('\n').map((line, i) => <p key={i}>{line}</p>)
                  ) : (
                    <div className="chat-thinking">
                      <span></span><span></span><span></span>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <form className="chat-input-bar" onSubmit={handleSend}>
        <div className="prompt-arrow">&gt;</div>
        <textarea 
          className="chat-textarea"
          placeholder="ENTER QUERY DIRECTIVE..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend(e);
            }
          }}
          disabled={!activeDoc || isTyping}
        />
        <button type="submit" className="chat-send-btn" disabled={!activeDoc || isTyping || !inputText.trim()}>
          {isTyping ? 'PROCESSING...' : 'TRANSMIT'}
        </button>
      </form>
    </div>
  );
};

export default ChatView;
