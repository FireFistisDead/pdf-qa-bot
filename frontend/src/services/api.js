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
 * Uploads a PDF file to the server.
 * @param {File} file 
 * @returns {Promise<Object>} Contains session_id
 */
export const uploadPdfApi = async (file) => {
  const formData = new FormData();
  formData.append("file", file);

  const res = await axios.post(`${API_BASE}/process-pdf`, formData, {
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
export const askQuestionApi = async (question, sessionId) => {
  const res = await axios.post(
    `${API_BASE}/ask`,
    { question, session_id: sessionId },
    {
      timeout: 60000, // 60 second timeout for AI responses
    }
  );
  return res.data;
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
export const askQuestionStreamApi = async (question, sessionId, onChunk, signal) => {
  const response = await fetch(`${API_BASE}/ask/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, session_id: sessionId }),
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
