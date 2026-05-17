const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs/promises");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024;

// Storage for uploaded PDFs
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: MAX_PDF_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    const isPdf =
      file.mimetype === "application/pdf" ||
      file.originalname.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      return cb(new Error("Only PDF files are allowed."));
    }

    cb(null, true);
  },
});

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
  const sessionId = req.body?.session_id || null;

  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No file uploaded. Use form field name 'file'.",
      });
    }

    // Send absolute path to Python service
    const response = await axios.post(
      "http://localhost:5000/process-pdf",
      {
        filePath: absoluteFilePath,
        filename: req.file.originalname,
        session_id: sessionId,
      }
    );

    // Cleanup uploaded file after successful processing
    await cleanupFile(uploadedFilePath);

    return res.json({
      message: "PDF uploaded & processed successfully!",
      session_id: response.data.session_id,
      document: response.data.document,
      documents: response.data.documents || [],
    });
  } catch (err) {
    // Ensure cleanup on failure
    await cleanupFile(uploadedFilePath);

    const statusCode = err.response?.status || (err.code === "LIMIT_FILE_SIZE" ? 413 : 500);
    const upstreamDetails = err.response?.data;
    const details = upstreamDetails?.detail || upstreamDetails?.error || err.message;
    console.error("Upload processing failed:", details);

    return res.status(statusCode).json({
      error: details || "PDF processing failed",
      details,
    });
  }
});

// Route: Ask Question
app.post("/ask", async (req, res) => {
  const { question, session_id } = req.body;

  if (!question || !question.trim()) {
    return res.status(400).json({ error: "Question is required." });
  }

  if (!session_id) {
    return res.status(400).json({ error: "session_id is required." });
  }

  try {
    const response = await axios.post(
      "http://localhost:5000/ask",
      {
        question,
        session_id,
      }
    );

    res.json({ answer: response.data.answer });
  } catch (err) {
    const statusCode = err.response?.status || 500;
    const details = err.response?.data?.detail || err.response?.data?.error || err.message;
    console.error("Question answering failed:", details);
    res.status(statusCode).json({
      error: details || "Error answering question",
    });
  }
});

app.post("/summarize", async (req, res) => {
  if (!req.body?.session_id) {
    return res.status(400).json({ error: "session_id is required." });
  }

  try {
    const response = await axios.post(
      "http://localhost:5000/summarize",
      req.body || {}
    );

    res.json({
      summary: response.data.summary,
    });
  } catch (err) {
    const statusCode = err.response?.status || 500;
    const details = err.response?.data?.detail || err.response?.data?.error || err.message;

    console.error("Summarization failed:", details);

    res.status(statusCode).json({
      error: details || "Error summarizing PDF",
      details,
    });
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      error: "File too large. Please choose a PDF under 20MB.",
    });
  }

  if (err) {
    return res.status(400).json({
      error: err.message || "Invalid upload request.",
    });
  }

  next();
});

app.listen(4000, () =>
  console.log("Backend running on http://localhost:4000")
);
