import axios from "axios";

const API_BASE = process.env.REACT_APP_API_URL || "";

export const extractApiErrorMessage = (error, fallbackMessage) => {
  return (
    error?.response?.data?.detail ||
    error?.response?.data?.error ||
    error?.response?.data?.message ||
    error?.message ||
    fallbackMessage
  );
};

/**
 * Fetches all past sessions (chat history).
 * @param {Array<{session_id: string, session_secret: string}>} sessions
 * @returns {Promise<Array>} Array of session objects
 */
export const getSessionsApi = async (sessions = []) => {
  if (!Array.isArray(sessions) || sessions.length === 0) return [];

  const res = await axios.post(
    `${API_BASE}/sessions/lookup`,
    { sessions },
    { timeout: 20000 }, // Increased to 20 seconds for cloud deployments
  );

  return res.data;
};

/**
 * Uploads a PDF file to the server.
 * @param {File} file 
 * @param {string | null} sessionId
 * @param {string | null} sessionSecret
 * @returns {Promise<Object>} Contains session_id
 */
export const uploadPdfApi = async (file, sessionId = null, sessionSecret = null) => {
  const formData = new FormData();
  formData.append("file", file);
  if (sessionId) {
    formData.append("session_id", sessionId);
  }
  if (sessionSecret) {
    formData.append("session_secret", sessionSecret);
  }

  const res = await axios.post(`${API_BASE}/upload`, formData, {
    timeout: 30000, // 30 second timeout
  });
  return res.data;
};

/**
 * Asks a question to the AI assistant about the uploaded PDF.
 * @param {string} question
 * @param {string} sessionId
 * @param {string} sessionSecret
 * @param {string} mode
 * @param {Array<{role:string, text:string}>} chatHistory  — current chat messages
 * @returns {Promise<Object>} Contains the bot's answer
 */
export const askQuestionApi = async (question, sessionId, sessionSecret, mode = "default", chatHistory = []) => {
  // Map internal {role, text} format to the API's {role, content} schema.
  // Only send the last 6 messages (3 turns) to keep the payload small.
  const chat_history = chatHistory
    .filter((m) => (m.role === "user" || m.role === "bot" || m.role === "assistant") && m.text && !m.streaming)
     .slice(-6)
     .map((m) => ({ role: m.role === "bot" ? "assistant" : m.role, content: m.text }));

  const res = await axios.post(
    `${API_BASE}/ask`,
    { question, session_id: sessionId, session_secret: sessionSecret, mode, chat_history },
    {
      timeout: 60000, // 60 second timeout for AI responses
    }
  );
  return {
    ...res.data,
    sources: Array.isArray(res.data?.sources) ? res.data.sources : [],
  };
};

/**
 * Summarizes the uploaded PDF document.
 * @param {string} pdfName 
 * @param {string} sessionId 
 * @param {string} sessionSecret
 * @returns {Promise<Object>} Contains the bot's summary
 */
export const summarizePdfApi = async (pdfName, sessionId, sessionSecret) => {
  const res = await axios.post(
    `${API_BASE}/summarize`,
    { pdf: pdfName, session_id: sessionId, session_secret: sessionSecret },
    {
      timeout: 60000, // 60 second timeout for summarization
    }
  );
  return res.data;
};
/**
 * Runs the on-demand knowledge gap analysis for the active document.
 * @param {string} sessionId
 * @param {string} sessionSecret
 * @param {string|null} documentId  — the active document_id (null = first doc)
 * @returns {Promise<Object>} Knowledge gap map response
 */
export const mapKnowledgeGapsApi = async (sessionId, sessionSecret, documentId = null) => {
  const body = { session_id: sessionId, session_secret: sessionSecret };
  if (documentId) body.document_id = documentId;
  const res = await axios.post(`${API_BASE}/knowledge-gaps`, body, {
    timeout: 60000,
  });
  return res.data;
};

/**
 * Streams an answer chunk-by-chunk.
 * @param {string} question
 * @param {string} sessionId
 * @param {string} sessionSecret
 * @param {string} mode
 * @param {Array<{role:string, text:string}>} chatHistory  — current chat messages
 * @param {Function} onChunk
 * @param {AbortSignal} signal
 */
export const askQuestionStreamApi = async (question, sessionId, sessionSecret, mode = "default", onChunk, signal, chatHistory = []) => {
  // Map internal chat messages to API schema, last 6 only, skip streaming entries.
  const chat_history = chatHistory
    .filter((m) => (m.role === "user" || m.role === "bot") && m.text && !m.streaming)
    .slice(-6)
    .map((m) => ({ role: m.role === "bot" ? "assistant" : m.role, content: m.text }));

  const response = await fetch(`${API_BASE}/ask/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, session_id: sessionId, session_secret: sessionSecret, mode, chat_history }),
    signal,
  });

    if (!response.ok) {
    let parsedBody = null;

    try {
      parsedBody = await response.json();
    } catch (_) {}

    const errorMessage = extractApiErrorMessage(
      {
        response: {
          status: response.status,
          data: parsedBody,
        },
      },
      "Error getting answer. Please try again.",
    );

    throw Object.assign(new Error(errorMessage), {
      response: {
        status: response.status,
        data: parsedBody,
      },
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    fullText += chunk;
    onChunk(fullText);
  }

  return fullText;
};

export const generateFlashcardsApi = async (sessionId, sessionSecret) => {
  const res = await axios.post(
    `${API_BASE}/sessions/flashcards`,
    { session_id: sessionId, session_secret: sessionSecret },
    {
      timeout: 100000,
    }
  );
  return res.data;
};

export const updateFlashcardProgressApi = async (sessionId, sessionSecret, cardId, rating) => {
  const res = await axios.post(
    `${API_BASE}/sessions/flashcards/progress`,
    { session_id: sessionId, session_secret: sessionSecret, card_id: cardId, rating },
    {
      timeout: 15000,
    }
  );
  return res.data;
};
