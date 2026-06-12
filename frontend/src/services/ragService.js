import { supabase } from './supabaseClient';

const RAG_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

/**
 * Downloads a PDF from Supabase Storage via the Node.js gateway,
 * sends it to the RAG service for indexing, and returns
 * { session_id, session_secret } needed for chat.
 *
 * @param {string} url        - Public Supabase Storage URL of the PDF
 * @param {string} filename   - Original filename (used by RAG service)
 * @param {Object} [opts]     - Optional: { session_id, session_secret } to extend existing session
 * @returns {Promise<{ session_id: string, session_secret: string }>}
 */
export const processDocument = async (url, filename, opts = {}) => {
  const body = { url, filename };
  if (opts.session_id && opts.session_secret) {
    body.session_id = opts.session_id;
    body.session_secret = opts.session_secret;
  }

  // Get current user's Supabase token to authenticate with the Node.js gateway
  const { data: { session } } = await supabase.auth.getSession();
  const headers = { 'Content-Type': 'application/json' };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  const res = await fetch(`${RAG_BASE_URL}/process-from-url`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Processing failed (HTTP ${res.status})`);
  }

  return res.json();
};

/**
 * Polls the RAG service for real-time processing progress.
 * Returns { stage, progress } where stage is a human-readable status string.
 *
 * @param {string} sessionId
 * @returns {Promise<{ stage: string, progress: number }>}
 */
export const getProcessingStatus = async (sessionId, sessionSecret) => {
  const headers = {};
  if (sessionSecret) {
    headers['X-Session-Secret'] = sessionSecret;
  }
  const res = await fetch(`${RAG_BASE_URL}/processing-status/${sessionId}`, { headers });
  if (!res.ok) return null;
  return res.json();
};

/**
 * Sends a question to the RAG /ask/stream endpoint (Server-Sent Events).
 * Calls onChunk(text) for each streamed token and onDone() when finished.
 *
 * @param {string}   sessionId
 * @param {string}   sessionSecret
 * @param {string}   question
 * @param {Function} onChunk   - Called with each text chunk from the LLM
 * @param {Function} onDone    - Called when streaming is complete
 * @param {Function} onError   - Called on error
 * @returns {AbortController} - Call .abort() to cancel the stream
 */
export const askStream = (sessionId, sessionSecret, question, onChunk, onDone, onError) => {
  const controller = new AbortController();

  const run = async () => {
    try {
      const res = await fetch(`${RAG_BASE_URL}/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          session_secret: sessionSecret,
          question,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Ask failed (HTTP ${res.status})`);
      }

      if (!res.body) {
        throw new Error('Streaming response is unavailable.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let completed = false;

      const handleEvent = (eventText) => {
        if (!eventText) return;

        let eventName = 'message';
        const dataLines = [];

        for (const rawLine of eventText.split('\n')) {
          const line = rawLine.replace(/\r$/, '');
          if (!line || line.startsWith(':')) {
            continue;
          }
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
            continue;
          }
          if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).replace(/^ /, ''));
          }
        }

        const data = dataLines.join('\n');

        if (!data) {
          return;
        }

        if (eventName === 'error') {
          completed = true;
          onError(data || 'Stream error');
          return;
        }

        if (data === '[DONE]') {
          completed = true;
          onDone();
          return;
        }

        onChunk(data);
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });

        // Normalize CRLF line endings to LF so frames using CRLF are
        // detected correctly (\r\n -> \n). This also tolerates mixed
        // line endings from various servers.
        buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        let separatorIndex = buffer.indexOf('\n\n');
        while (separatorIndex !== -1) {
          const eventText = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);
          handleEvent(eventText);
          if (completed) {
            // Cancel the reader to release the connection promptly.
            try {
              await reader.cancel();
            } catch (cancelErr) {
              // ignore
            }
            return;
          }
          separatorIndex = buffer.indexOf('\n\n');
        }
      }

      buffer += decoder.decode();
      if (buffer.trim()) {
        handleEvent(buffer);
      }

      if (!completed) {
        onDone();
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        onError(err.message || 'Stream error');
      }
    }
  };

  run();
  return controller;
};
