const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { z } = require("zod");

const app = express();
app.use(cors());
app.use(express.json());

const UPLOADS_DIR = path.resolve("uploads");
const isDevelopment = process.env.NODE_ENV !== "production";

// Storage for uploaded PDFs with validation
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const safeName = crypto.randomUUID() + ".pdf";
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
  fileFilter: (req, file, cb) => {
    const isPdfMime = file.mimetype === "application/pdf";
    const isPdfExtension = file.originalname.toLowerCase().endsWith(".pdf");

    if (isPdfMime && isPdfExtension) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
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

// Validation Schemas
const askSchema = z.object({
  question: z.string().trim().min(1, "Question cannot be empty"),
  session_id: z.string().uuid("Invalid session ID format"),
});

const summarizeSchema = z.object({
  session_id: z.string().uuid("Invalid session ID format"),
});

// Route: Upload PDF
app.post("/upload", upload.single("file"), async (req, res) => {
  const uploadedFilePath = req.file?.path;
  // Always send absolute path to FastAPI
  const absoluteFilePath = uploadedFilePath
    ? path.resolve(uploadedFilePath)
    : null;

  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No file uploaded. Use form field name 'file'.",
      });
    }

    // Send absolute path to Python service
    const response = await axios.post("http://localhost:5000/process-pdf", {
      filePath: absoluteFilePath,
    });

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
      details: isDevelopment ? details : "Internal processing error",
    });
  }
});

// Route: Ask Question
app.post("/ask", async (req, res) => {
  const validation = askSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      error: "Validation failed",
      details: validation.error.errors,
    });
  }

  const { question, session_id } = validation.data;

  try {
    const response = await axios.post("http://localhost:5000/ask", {
      question,
      session_id,
    });

    res.json({ answer: response.data.answer });
  } catch (err) {
    const status = err.response?.status || 500;
    const details = err.response?.data || err.message;

    console.error("Question answering failed:", details);

    return res.status(status).json({
      error: "Error answering question",
      details: isDevelopment ? details : "Internal processing error",
    });
  }
});

app.post("/summarize", async (req, res) => {
  const validation = summarizeSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      error: "Validation failed",
      details: validation.error.errors,
    });
  }

  try {
    const response = await axios.post(
      "http://localhost:5000/summarize",
      validation.data,
    );

    res.json({
      summary: response.data.summary,
    });
  } catch (err) {
    const status = err.response?.status || 500;
    const details = err.response?.data || err.message;

    console.error("Summarization failed:", details);

    return res.status(status).json({
      error: "Error summarizing PDF",
      details: isDevelopment ? details : "Internal processing error",
    });
  }
});

// Global Error Handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res
      .status(400)
      .json({ error: "File upload error", details: err.message });
  }
  if (err.message === "Only PDF files are allowed") {
    return res
      .status(400)
      .json({ error: "Invalid file type", details: err.message });
  }

  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(4000, () => console.log("Backend running on http://localhost:4000"));
