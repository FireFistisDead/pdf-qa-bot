const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs/promises");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const UPLOADS_DIR = path.resolve("uploads");
const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB
const SESSION_ID_PATTERN = /^[0-9a-f-]{36}$/i;

const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: MAX_PDF_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
      return;
    }
    cb(new Error("Only PDF files are allowed"));
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

const validateQuestionPayload = (body) => {
  const { question, session_id } = body || {};

  if (typeof question !== "string" || question.trim().length === 0) {
    return { error: "question is required and must be a non-empty string" };
  }

  if (question.trim().length > 2000) {
    return { error: "question must be 2000 characters or fewer" };
  }

  if (typeof session_id !== "string" || !SESSION_ID_PATTERN.test(session_id)) {
    return { error: "session_id must be a valid UUID" };
  }

  return { question: question.trim(), session_id };
};

const validateSummarizePayload = (body) => {
  const { session_id } = body || {};

  if (typeof session_id !== "string" || !SESSION_ID_PATTERN.test(session_id)) {
    return { error: "session_id must be a valid UUID" };
  }

  return { session_id };
};

// Route: Upload PDF
app.post("/upload", upload.single("file"), async (req, res) => {
  const uploadedFilePath = req.file?.path;
  const absoluteFilePath = uploadedFilePath ? path.resolve(uploadedFilePath) : null;

  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No file uploaded. Use form field name 'file'.",
      });
    }

    const response = await axios.post(
      "http://localhost:5000/process-pdf",
      {
        filePath: absoluteFilePath,
      }
    );

    await cleanupFile(uploadedFilePath);

    return res.json({
      message: "PDF uploaded & processed successfully!",
      session_id: response.data.session_id,
    });
  } catch (err) {
    await cleanupFile(uploadedFilePath);

    const details = err.response?.data || err.message;
    console.error("Upload processing failed:", details);

    return res.status(500).json({
      error: "PDF processing failed",
      details,
    });
  }
});

app.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "PDF must be 10 MB or smaller" });
    }
    return res.status(400).json({ error: err.message });
  }

  if (err?.message === "Only PDF files are allowed") {
    return res.status(400).json({ error: err.message });
  }

  return next(err);
});

// Route: Ask Question
app.post("/ask", async (req, res) => {
  const validated = validateQuestionPayload(req.body);
  if (validated.error) {
    return res.status(400).json({ error: validated.error });
  }

  const { question, session_id } = validated;

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
    console.error(err.message);
    res.status(500).json({
      error: "Error answering question",
    });
  }
});

app.post("/summarize", async (req, res) => {
  const validated = validateSummarizePayload(req.body);
  if (validated.error) {
    return res.status(400).json({ error: validated.error });
  }

  try {
    const response = await axios.post(
      "http://localhost:5000/summarize",
      {
        session_id: validated.session_id,
      }
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
