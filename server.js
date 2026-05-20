const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { rateLimit } = require("express-rate-limit");

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || "http://localhost:5000";
const PORT = process.env.PORT || 4000;

const app = express();

// ─── Trust Proxy ────────────────────────────────────────────────────────────
// Critical for cloud deployments (AWS ALB, Cloudflare, Nginx). Without this,
// Express only sees the load-balancer IP, so the rate limiter would lock out
// ALL users the moment a single attacker spams the API.
// Set to the number of reverse proxies in front of this server.
const PROXY_COUNT = parseInt(process.env.PROXY_COUNT || "0", 10);
if (PROXY_COUNT > 0) {
  app.set("trust proxy", PROXY_COUNT);
}

app.use(cors());
app.use(express.json());

// ─── Rate Limiters ───────────────────────────────────────────────────────────
// Global baseline limiter — broad protection against bots/scrapers.
// 200 requests per 15 minutes per IP across all routes.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: "draft-7", // Sends `RateLimit-*` headers (RFC-compliant)
  legacyHeaders: false,
  message: {
    error: "Too many requests. Please slow down and try again later.",
  },
});

// Upload limiter — uploading triggers PyPDF parsing + FAISS embedding which
// is very expensive on CPU/GPU. Limit to 10 uploads per hour per IP.
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: parseInt(process.env.RATE_LIMIT_UPLOAD_MAX || "10", 10),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Upload limit reached. You can upload up to 10 PDFs per hour. Please try again later.",
  },
});

// Inference limiter — /ask and /summarize hit the LLM inference pipeline.
// Even a handful of concurrent requests can saturate the GPU.
// 30 requests per 5 minutes per IP.
const inferenceLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: parseInt(process.env.RATE_LIMIT_INFERENCE_MAX || "30", 10),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Inference limit reached. Please wait a few minutes before asking more questions.",
  },
});

// Apply global limiter to every route
app.use(globalLimiter);

const MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024;
const UPLOADS_DIR = path.resolve("uploads");
const isDevelopment = process.env.NODE_ENV !== "production";

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, `${crypto.randomUUID()}.pdf`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_PDF_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    const isPdfMime = file.mimetype === "application/pdf";
    const isPdfExtension = file.originalname.toLowerCase().endsWith(".pdf");

    if (!isPdfMime || !isPdfExtension) {
      return cb(new Error("Only PDF files are allowed."));
    }

    cb(null, true);
  },
});

const cleanupFile = async (filePath) => {
  if (!filePath) return;

  try {
    const safePath = path.join(UPLOADS_DIR, path.basename(filePath));
    await fsPromises.unlink(safePath);
    console.log(`Deleted temp file: ${safePath}`);
  } catch (err) {
    console.error(`Failed to delete temp file ${filePath}:`, err.message);
  }
};

const sendUploadError = (res, statusCode, message, details = message) => {
  console.error("Upload failed:", details);
  return res.status(statusCode).json({
    error: message,
    details,
  });
};

const extractServiceDetails = (err) => {
  const upstreamDetails = err.response?.data;
  return (
    upstreamDetails?.detail ||
    upstreamDetails?.error ||
    upstreamDetails ||
    err.message
  );
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const validateSessionId = (sessionId) => {
  if (!sessionId || typeof sessionId !== "string") {
    return "session_id is required.";
  }
  if (!uuidPattern.test(sessionId)) {
    return "Invalid session ID format.";
  }
  return null;
};

const askSchema = {
  safeParse: (body) => {
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    if (!question) {
      return { success: false, error: new Error("Question is required.") };
    }

    const sessionError = validateSessionId(body?.session_id);
    if (sessionError) {
      return { success: false, error: new Error(sessionError) };
    }

    return {
      success: true,
      data: {
        question,
        session_id: body.session_id,
      },
    };
  }
};

const summarizeSchema = {
  safeParse: (body) => {
    const sessionError = validateSessionId(body?.session_id);
    if (sessionError) {
      return { success: false, error: new Error(sessionError) };
    }

    return {
      success: true,
      data: {
        session_id: body.session_id,
      },
    };
  }
};

app.post("/upload", uploadLimiter, upload.single("file"), async (req, res) => {
  const uploadedFilePath = req.file?.path;
  const absoluteFilePath = uploadedFilePath
    ? path.resolve(uploadedFilePath)
    : null;
  const sessionId = req.body?.session_id || null;

  try {
    if (!req.file) {
      return sendUploadError(
        res,
        400,
        "No file uploaded. Use form field name 'file'."
      );
    }

    if (req.file.size === 0) {
      await cleanupFile(uploadedFilePath);
      return sendUploadError(
        res,
        400,
        "Uploaded PDF is empty. Please choose a valid PDF file.",
      );
    }

    const response = await axios.post(`${RAG_SERVICE_URL}/process-pdf`, {
      filePath: absoluteFilePath,
      filename: req.file.originalname,
      session_id: sessionId,
    });

    await cleanupFile(uploadedFilePath);

    return res.json({
      message: "PDF uploaded & processed successfully!",
      session_id: response.data.session_id,
      document: response.data.document,
      documents: response.data.documents || [],
    });
  } catch (err) {
    await cleanupFile(uploadedFilePath);

    const statusCode =
      err.response?.status || (err.code === "ECONNREFUSED" ? 502 : 500);
    const details = extractServiceDetails(err);
    console.error("Upload processing failed:", details);

    return res.status(statusCode).json({
      error: typeof details === "string" ? details : "PDF processing failed",
      details: isDevelopment ? details : "Internal processing error",
    });
  }
});

app.post("/ask", inferenceLimiter, async (req, res) => {
  const validation = askSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      error: validation.error.message,
    });
  }

  const { question, session_id } = validation.data;

  try {
    const response = await axios.post(`${RAG_SERVICE_URL}/ask`, {
      question,
      session_id,
    });

    return res.json({
      answer: response.data.answer,
      sources: response.data.sources ?? [],
    });
  } catch (err) {
    const statusCode = err.response?.status || 500;
    const details = extractServiceDetails(err);
    console.error("Question answering failed:", details);

    return res.status(statusCode).json({
      error: typeof details === "string" ? details : "Error answering question",
      details: isDevelopment ? details : "Internal processing error",
    });
  }
});

app.post("/summarize", inferenceLimiter, async (req, res) => {
  const validation = summarizeSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      error: validation.error.message,
    });
  }

  try {
    const response = await axios.post(
      `${RAG_SERVICE_URL}/summarize`,
      validation.data
    );

    return res.json({
      summary: response.data.summary,
    });
  } catch (err) {
    const statusCode = err.response?.status || 500;
    const details = extractServiceDetails(err);
    console.error("Summarization failed:", details);

    return res.status(statusCode).json({
      error: typeof details === "string" ? details : "Error summarizing PDF",
      details: isDevelopment ? details : "Internal processing error",
    });
  }
});

app.use((req, res, next) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const statusCode = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "File too large. Please choose a PDF under 20MB."
        : "File upload error";

    return res.status(statusCode).json({
      error: message,
      details: err.message,
    });
  }

  if (err) {
    console.error("Upload failed:", err.message);
    return res.status(400).json({
      error: err.message || "Invalid upload request.",
    });
  }

  next();
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
}

module.exports = { app, askSchema, summarizeSchema };
