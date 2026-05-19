import axios from "axios";

const API_BASE = process.env.REACT_APP_API_URL || "";

/**
 * Uploads a PDF file to the server.
 * @param {File} file 
 * @returns {Promise<Object>} Contains session_id
 */
export const uploadPdfApi = async (file) => {
  const formData = new FormData();
  formData.append("file", file);

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
