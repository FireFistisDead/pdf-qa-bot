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
 * @returns {Promise<Array>} Array of session objects
 */
export const getSessionsApi = async () => {
  const res = await axios.get(`${API_BASE}/sessions`, {
    timeout: 20000, // Increased to 20 seconds for cloud deployments
  });
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
 * @returns {Promise<Object>} Contains the bot's answer
 */
export const askQuestionApi = async (question, sessionId, mode = "default") => {
  const res = await axios.post(
    `${API_BASE}/ask`,
    { question, session_id: sessionId, mode },
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
 * @returns {Promise<Object>} Contains the bot's summary
 */
export const summarizePdfApi = async (pdfName, sessionId) => {
  const res = await axios.post(
    `${API_BASE}/summarize`,
    { pdf: pdfName, session_id: sessionId },
    {
      timeout: 60000, // 60 second timeout for summarization
    }
  );
  return res.data;
};
export const askQuestionStreamApi = async (question, sessionId, mode = "default", onChunk, signal) => {
  const response = await fetch(`${API_BASE}/ask/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, session_id: sessionId, mode }),
    signal,
  });

  if (!response.ok) {
    let errorMessage = "Error getting answer. Please try again.";
    try {
      const errorBody = await response.json();
      errorMessage = errorBody.error || errorBody.detail || errorMessage;
    } catch (_) {}
    throw Object.assign(new Error(errorMessage), { response: { status: response.status } });
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
