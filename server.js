const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { rateLimit } = require("express-rate-limit");
const slowDown = require("express-slow-down");
const helmet = require("helmet");
const { askSchema, summarizeSchema } = require("./validators/schemas");

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || "http://localhost:5000";
const PORT = process.env.PORT || 4000;

const askSchema = {
  type: "object",
  properties: {
    question: { type: "string" },
    session_id: { type: "string" }
  },
  required: ["question", "session_id"]
};

const summarizeSchema = {
  type: "object",
  properties: {
    pdf: { type: "string" },
    session_id: { type: "string" }
  },
  required: ["pdf", "session_id"]
};

const app = express();

// ─── Trust Proxy ────────────────────────────────────────────────────────────
// Critical for cloud deployments (AWS ALB, Cloudflare, Nginx). Without this,
// Express only sees the load-balancer IP, so the rate limiter would lock out
// ALL users the moment a single attacker spams the API.
// Set to the number of reverse proxies in front of this server (e.g. PROXY_COUNT=1).
const PROXY_COUNT = parseInt(process.env.PROXY_COUNT || "0", 10);
if (PROXY_COUNT > 0) {
  app.set("trust proxy", PROXY_COUNT);
}

// ─── Helmet — HTTP Security Headers ─────────────────────────────────────────
// Hardens the HTTP layer against clickjacking, MIME sniffing, XSS, etc.
// These headers are your first line of defence before any code even runs.
app.use(helmet());

app.use(cors());

// ─── Body Size Limit ─────────────────────────────────────────────────────────
// Cap JSON payloads at 16 KB. Prevents memory exhaustion from huge JSON bodies
// sent to /ask or /summarize by an attacker trying to blow out the parser.
app.use(express.json({ limit: "16kb" }));

// ─── IP Ban Registry ─────────────────────────────────────────────────────────
// In-memory stepped ban system. Each time an IP trips a rate limiter, its
// offence count increments and the ban window grows on a fixed stepped schedule
// (not exponential/doubling — see BAN_DURATIONS_MS for the exact policy).
// Offence 1 → 5 min ban | Offence 2 → 15 min | Offence 3+ → 1 hour
// This is a lightweight, zero-dependency solution suitable for single-instance
// deployments. For multi-instance cloud deployments, replace with Redis.
const bannedIPs = new Map(); // ip → { until: timestamp, offences: number }

const BAN_DURATIONS_MS = [
  5 * 60 * 1000,  // Offence 1 → 5 minutes
  15 * 60 * 1000, // Offence 2 → 15 minutes
  60 * 60 * 1000, // Offence 3+ → 1 hour
];

const recordOffence = (ip) => {
  const existing = bannedIPs.get(ip) || { offences: 0 };
  const offences = existing.offences + 1;
  const durationIndex = Math.min(offences - 1, BAN_DURATIONS_MS.length - 1);
  const until = Date.now() + BAN_DURATIONS_MS[durationIndex];
  bannedIPs.set(ip, { until, offences });
  console.warn(`[BAN] IP=${ip} offences=${offences} banned until=${new Date(until).toISOString()}`);
};

// Purge expired bans every 10 minutes so the Map doesn't grow forever.
const banCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [ip, ban] of bannedIPs.entries()) {
    if (ban.until <= now) bannedIPs.delete(ip);
  }
}, 10 * 60 * 1000);

if (typeof banCleanupInterval.unref === "function") {
  banCleanupInterval.unref();
}

// Ban-check middleware — runs before every route.
const banGuard = (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress;
  const ban = bannedIPs.get(ip);
  if (ban && ban.until > Date.now()) {
    const retryAfterSec = Math.ceil((ban.until - Date.now()) / 1000);
    res.set("Retry-After", String(retryAfterSec));
    return res.status(429).json({
      error: `Your IP has been temporarily banned due to repeated abuse. Try again in ${Math.ceil(retryAfterSec / 60)} minute(s).`,
    });
  }
  next();
};

// A handler factory that records an offence then returns 429.
// Pass this as the `handler` option to any rateLimit() config.
const rateLimitHandler = (req, res) => {
  const ip = req.ip || req.socket.remoteAddress;
  recordOffence(ip);
  res.status(429).json({
    error: res.locals.rateLimitMessage || "Too many requests. Please slow down.",
  });
};

// ─── Rate Limiters ───────────────────────────────────────────────────────────

// Global baseline — broad bot/scraper protection across every route.
// 200 req / 15 min per IP. Tripping this triggers the escalating ban.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (req, res) => {
    res.locals.rateLimitMessage = "Too many requests. Please slow down and try again later.";
    rateLimitHandler(req, res);
  },
});

// Hard cap: configured uploads / hour per IP. Tripping this triggers the ban system.
const uploadLimitMax = parseInt(process.env.RATE_LIMIT_UPLOAD_MAX || "10", 10);
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: uploadLimitMax,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (req, res) => {
    res.locals.rateLimitMessage = `Upload limit reached. You can upload up to ${uploadLimitMax} PDFs per hour. Please try again later.`;
    rateLimitHandler(req, res);
  },
});

// Inference slow-down — adds progressive friction BEFORE the hard block fires.
// RATE_LIMIT_SLOWDOWN_AFTER (default 10): number of free requests per window.
// After that, each extra request incurs an additional (hits - delayAfter) * 500ms
// delay, starting at 500ms and capped at 5s. This gives a genuine linear ramp
// instead of jumping straight to multi-second delays on the very first hit over
// the threshold. Kept separate from RATE_LIMIT_INFERENCE_MAX so operators can
// tune slow-down friction and hard-block quota independently.
const SLOWDOWN_DELAY_AFTER = parseInt(process.env.RATE_LIMIT_SLOWDOWN_AFTER || "10", 10);
const inferenceSlowDown = slowDown({
  windowMs: 5 * 60 * 1000,
  delayAfter: SLOWDOWN_DELAY_AFTER,
  delayMs: (hits) => (hits - SLOWDOWN_DELAY_AFTER) * 500,
  maxDelayMs: 5000,
});

// Inference hard limiter — fires after slow-down window if the attacker still
// keeps hammering. Triggers the escalating ban on violation.
const inferenceLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_INFERENCE_MAX || "30", 10),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (req, res) => {
    res.locals.rateLimitMessage = "Inference limit reached. Please wait a few minutes before sending more requests.";
    rateLimitHandler(req, res);
  },
});

// Apply the ban guard and global limiter to every single route.
app.use(banGuard);
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
        "No file uploaded. Use form field name 'file'.",
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

app.post("/ask", inferenceSlowDown, inferenceLimiter, async (req, res) => {
  const validation = askSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      error: "Validation failed",
      details: validation.error.flatten(),
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

app.post("/summarize", inferenceSlowDown, inferenceLimiter, async (req, res) => {
  const validation = summarizeSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      error: "Validation failed",
      details: validation.error.flatten(),
    });
  }

  try {
    const response = await axios.post(
      `${RAG_SERVICE_URL}/summarize`,
      validation.data,
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
  const server = app.listen(PORT, () =>
    console.log(`Backend running on port ${PORT}`)
  );

  // ─── Server-Level Timeouts ───────────────────────────────────────────────
  // Slow-loris and connection-exhaustion attacks open connections and then
  // trickle data to keep the socket alive forever. These timeouts kill them.
  server.keepAliveTimeout = 65_000;  // 65 s — slightly above typical LB (60 s)
  server.headersTimeout = 70_000;    // Must be > keepAliveTimeout
  server.requestTimeout = 120_000;   // Max time to fully receive a request (2 min)
}

module.exports = { app, askSchema, summarizeSchema };
