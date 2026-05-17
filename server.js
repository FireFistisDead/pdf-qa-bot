const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs/promises");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || "http://localhost:5000";

// Storage for uploaded PDFs
const upload = multer({ dest: "uploads/" });

/**
 * Safely delete uploaded temp file
 */
const cleanupFile = async (filePath) => {
  if (!filePath) return;

  try {
    await fs.unlink(filePath);
    console.log(`Deleted temp file: ${filePath}`);
  } catch (err) {
    console.error(`Failed to delete temp file ${filePath}:`, err.message);
  }
};

// Route: Upload PDF
app.post("/upload", upload.single("file"), async (req, res) => {
  const uploadedFilePath = req.file?.path;
  // Always send absolute path to FastAPI
  const absoluteFilePath = uploadedFilePath ? path.resolve(uploadedFilePath) : null;

  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No file uploaded. Use form field name 'file'.",
      });
    }

    // Send absolute path to Python service
    const response = await axios.post(
      `${RAG_SERVICE_URL}/process-pdf`,
      {
        filePath: absoluteFilePath,
      }
    );

    // Cleanup uploaded file after successful processing
    await cleanupFile(uploadedFilePath);

    return res.json({
      message: "PDF uploaded & processed successfully!",
      session_id: response.data.session_id,
    });
  } catch (err) {
    // Ensure cleanup on failure
    await cleanupFile(uploadedFilePath);

    const details = err.response?.data || err.message;
    console.error("Upload processing failed:", details);

    return res.status(500).json({
      error: "PDF processing failed",
      details,
    });
  }
});

// Route: Ask Question
app.post("/ask", async (req, res) => {
  const { question, session_id } = req.body;

  try {
    const response = await axios.post(
      `${RAG_SERVICE_URL}/ask`,
      {
        question,
        session_id,
      }
    );

    res.json({ answer: response.data.answer });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      error: "Error answering question",
    });
  }
});

app.post("/summarize", async (req, res) => {
  try {
    const response = await axios.post(
      `${RAG_SERVICE_URL}/summarize`,
      req.body || {}
    );

    res.json({
      summary: response.data.summary,
    });
  } catch (err) {
    const details = err.response?.data || err.message;

    console.error("Summarization failed:", details);

    res.status(500).json({
      error: "Error summarizing PDF",
      details,
    });
  }
});

app.listen(4000, () =>
  console.log("Backend running on http://localhost:4000")
);