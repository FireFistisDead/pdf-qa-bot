/**
 * ragService.js
 * All calls to the Node.js API Gateway (port 4000) for RAG operations.
 */

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

  const res = await fetch(`${RAG_BASE_URL}/process-from-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
export const getProcessingStatus = async (sessionId) => {
  const res = await fetch(`${RAG_BASE_URL}/processing-status/${sessionId}`);
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

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        // SSE format: "data: <text>\n\n"
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const text = line.slice(6);
            if (text === '[DONE]') {
              onDone();
              return;
            }
            onChunk(text);
          }
        }
      }
      onDone();
    } catch (err) {
      if (err.name !== 'AbortError') {
        onError(err.message || 'Stream error');
      }
    }
  };

  run();
  return controller;
};
