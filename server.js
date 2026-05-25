// feat: file type and size validation added for /upload endpoint (closes #179)
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
const { clientIpFromRequest } = require("./security/ip");
const { createRedisClient } = require("./security/redis");

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || "http://localhost:5000";
const INTERNAL_RAG_TOKEN = process.env.INTERNAL_RAG_TOKEN || "";
const PORT = process.env.PORT || 4000;

const app = express();

// ─── Distributed Rate Limiting / Ban Store ───────────────────────────────────
// The in-memory stores are safe only for single-instance deployments. In any
// multi-replica setup (Kubernetes / PM2 cluster / autoscaling), a per-process
// store can be bypassed via load balancer round-robin.
const RATE_LIMIT_STORE = (process.env.RATE_LIMIT_STORE || "memory").toLowerCase();
const RATE_LIMIT_REDIS_URL =
  process.env.RATE_LIMIT_REDIS_URL || process.env.REDIS_URL || "";

let redisClient = null;
let redisConnectPromise = null;

if (RATE_LIMIT_STORE === "redis") {
  if (!RATE_LIMIT_REDIS_URL) {
    throw new Error(
      "RATE_LIMIT_STORE=redis requires RATE_LIMIT_REDIS_URL (or REDIS_URL) to be set.",
    );
  }
  const { client, connectPromise } = createRedisClient(RATE_LIMIT_REDIS_URL);
  redisClient = client;
  redisConnectPromise = connectPromise;
}

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

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || "http://localhost:3000",
  methods: ["POST"],
}));

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

const BAN_REDIS_PREFIX = process.env.BAN_REDIS_PREFIX || "ban:";

const recordOffence = (ip) => {
  const existing = bannedIPs.get(ip) || { offences: 0 };
  const offences = existing.offences + 1;
  const durationIndex = Math.min(offences - 1, BAN_DURATIONS_MS.length - 1);
  const until = Date.now() + BAN_DURATIONS_MS[durationIndex];
  bannedIPs.set(ip, { until, offences });
  console.warn(`[BAN] IP=${ip} offences=${offences} banned until=${new Date(until).toISOString()}`);
};

const recordOffenceDistributed = async (ip) => {
  if (!redisClient) return;

  const key = `${BAN_REDIS_PREFIX}${ip}`;

  // Lua for atomic offence increment + TTL update.
  // Keeps behavior aligned with the in-memory version (offences reset when TTL expires).
  const script = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local offences = redis.call("HINCRBY", key, "offences", 1)
local len = #ARGV - 1
local idx = offences
if idx > len then idx = len end
local duration = tonumber(ARGV[1 + idx])
local until = now + duration
redis.call("HSET", key, "until", until)
redis.call("PEXPIRE", key, duration)
return { offences, until }
`;

  try {
    const res = await redisClient.sendCommand([
      "EVAL",
      script,
      "1",
      key,
      String(Date.now()),
      ...BAN_DURATIONS_MS.map(String),
    ]);
    const offences = Array.isArray(res) ? Number(res[0]) : NaN;
    const until = Array.isArray(res) ? Number(res[1]) : NaN;
    if (Number.isFinite(offences) && Number.isFinite(until)) {
      console.warn(
        `[BAN] IP=${ip} offences=${offences} banned until=${new Date(until).toISOString()} (redis)`,
      );
    }
  } catch (err) {
    console.warn("[BAN] redis ban write failed:", err?.message || err);
  }
};

// Purge expired bans every 10 minutes so the Map doesn't grow forever.
if (!redisClient) {
  const banCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, ban] of bannedIPs.entries()) {
      if (ban.until <= now) bannedIPs.delete(ip);
    }
  }, 10 * 60 * 1000);

  if (typeof banCleanupInterval.unref === "function") {
    banCleanupInterval.unref();
  }
}

// Ban-check middleware — runs before every route.
const banGuard = async (req, res, next) => {
  const ip = clientIpFromRequest(req);

  if (!ip) return next();

  if (redisClient) {
    try {
      const key = `${BAN_REDIS_PREFIX}${ip}`;
      const until = await redisClient.sendCommand(["HGET", key, "until"]);
      const untilMs = until ? Number(until) : NaN;
      if (Number.isFinite(untilMs) && untilMs > Date.now()) {
        const retryAfterSec = Math.ceil((untilMs - Date.now()) / 1000);
        res.set("Retry-After", String(retryAfterSec));
        return res.status(429).json({
          error: `Your IP has been temporarily banned due to repeated abuse. Try again in ${Math.ceil(retryAfterSec / 60)} minute(s).`,
        });
      }
    } catch (err) {
      // Fail-open: don't take the whole API down if Redis is transiently unavailable.
      console.warn("[BAN] redis ban read failed:", err?.message || err);
    }

    return next();
  }

  const ban = bannedIPs.get(ip);
  if (ban && ban.until > Date.now()) {
    const retryAfterSec = Math.ceil((ban.until - Date.now()) / 1000);
    res.set("Retry-After", String(retryAfterSec));
    return res.status(429).json({
      error: `Your IP has been temporarily banned due to repeated abuse. Try again in ${Math.ceil(retryAfterSec / 60)} minute(s).`,
    });
  }

  return next();
};

// A handler factory that records an offence then returns 429.
// Pass this as the `handler` option to any rateLimit() config.
const rateLimitHandler = (req, res) => {
  const ip = clientIpFromRequest(req);
  if (redisClient) {
    void recordOffenceDistributed(ip);
  } else {
    recordOffence(ip);
  }
  res.status(429).json({
    error: res.locals.rateLimitMessage || "Too many requests. Please slow down.",
  });
};

// ─── Rate Limiters ───────────────────────────────────────────────────────────
const keyGenerator = (req) => clientIpFromRequest(req) || "unknown";
// Note: express-rate-limit's `ipv6Subnet` is not compatible with a custom
// `keyGenerator`. If you need IPv6 masking, implement it inside `clientIpFromRequest`.

let RedisStore = null;
if (redisClient) {
  // Loaded only when RATE_LIMIT_STORE=redis is enabled.
  ({ RedisStore } = require("rate-limit-redis"));
}

const createLimiterStore = (prefix) => {
  if (!redisClient || !RedisStore) return undefined;
  return new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix,
  });
};

// Global baseline — broad bot/scraper protection across every route.
// 200 req / 15 min per IP. Tripping this triggers the escalating ban.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator,
  store: createLimiterStore("rl:global:"),
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
  keyGenerator,
  store: createLimiterStore("rl:upload:"),
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
  keyGenerator,
  store: createLimiterStore("sd:inference:"),
});

// Inference hard limiter — fires after slow-down window if the attacker still
// keeps hammering. Triggers the escalating ban on violation.
const inferenceLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_INFERENCE_MAX || "30", 10),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator,
  store: createLimiterStore("rl:inference:"),
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

// Serve the uploads directory statically so frontend can view historical PDFs
app.use("/uploads", express.static(UPLOADS_DIR));

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

const stringifyServiceDetails = (details) => {
  if (details == null) return "";

  if (Buffer.isBuffer(details)) {
    return details.toString("utf8").trim();
  }

  if (typeof details === "string") {
    return details.trim();
  }

  if (typeof details === "object") {
    const nested =
      stringifyServiceDetails(details.detail) ||
      stringifyServiceDetails(details.error) ||
      stringifyServiceDetails(details.message);

    if (nested) return nested;

    const hasKnownErrorField =
      Object.prototype.hasOwnProperty.call(details, "detail") ||
      Object.prototype.hasOwnProperty.call(details, "error") ||
      Object.prototype.hasOwnProperty.call(details, "message");

    if (hasKnownErrorField && Object.keys(details).length <= 3) {
      return "";
    }

    try {
      const serialized = JSON.stringify(details);
      return serialized === "{}" ? "" : serialized;
    } catch (_) {
      return "";
    }
  }

  return String(details).trim();
};

const extractServiceDetails = (err, fallbackMessage = "Upstream service request failed.") => {
  return (
    stringifyServiceDetails(err.response?.data) ||
    stringifyServiceDetails(err.message) ||
    stringifyServiceDetails(err.code) ||
    fallbackMessage
  );
};

const ragAuthHeaders = () =>
  INTERNAL_RAG_TOKEN ? { "X-Internal-Token": INTERNAL_RAG_TOKEN } : {};

const normalizeSessionSecret = (value) =>
  typeof value === "string" ? value.trim() || null : null;

const validateSessionExtension = async (sessionId, sessionSecret) => {
  if (!sessionId) {
    return {
      allowed: false,
      statusCode: 400,
      error: "session_id is required to extend a session.",
    };
  }

  if (!sessionSecret) {
    return {
      allowed: false,
      statusCode: 403,
      error: "session_secret is required to extend an existing session.",
    };
  }

  try {
    await axios.post(
      `${RAG_SERVICE_URL}/validate-session-write`,
      {
        session_id: sessionId,
        session_secret: sessionSecret,
      },
      { headers: ragAuthHeaders() },
    );

    return { allowed: true };
  } catch (err) {
    const statusCode = err.response?.status || (err.code === "ECONNREFUSED" ? 502 : 500);
    const details = extractServiceDetails(err);

    return {
      allowed: false,
      statusCode,
      error: typeof details === "string" ? details : "Session extension denied.",
      details,
    };
  }
};

app.post("/upload", uploadLimiter, upload.single("file"), async (req, res) => {
  const uploadedFilePath = req.file?.path;
  // CodeQL [js/path-injection] Mitigation: Break taint flow by forcing basename
  const absoluteFilePath = uploadedFilePath
    ? path.join(UPLOADS_DIR, path.basename(uploadedFilePath))
    : null;
  const sessionId = req.body?.session_id || null;
  const sessionSecret = normalizeSessionSecret(req.body?.session_secret);

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

    if (sessionId) {
      const validation = await validateSessionExtension(sessionId, sessionSecret);
      if (!validation.allowed) {
        await cleanupFile(uploadedFilePath);
        return sendUploadError(
          res,
          validation.statusCode,
          validation.error,
          validation.details || validation.error,
        );
      }
    }

    const fileHandle = await fsPromises.open(absoluteFilePath, "r");
const signatureBuffer = Buffer.alloc(4);

try {
  await fileHandle.read(signatureBuffer, 0, 4, 0);
} finally {
  await fileHandle.close();
}

if (signatureBuffer.toString() !== "%PDF") {
  await cleanupFile(uploadedFilePath);

  return sendUploadError(
    res,
    415,
    "Invalid file type. Only real PDF documents are accepted.",
  );
}
    const formData = {
      file: fs.createReadStream(absoluteFilePath),
      original_filename: req.file.originalname,
    };
    if (sessionId && sessionSecret) {
      formData.session_id = sessionId;
      formData.session_secret = sessionSecret;
    } else if (sessionId || sessionSecret) {
      await cleanupFile(uploadedFilePath);

      return sendUploadError(
        res,
        403,
        "session_id and session_secret must be provided together to extend an existing session.",
      );
    }
    if (sessionSecret) {
      formData.session_secret = sessionSecret;
    }

    const response = await axios.postForm(
      `${RAG_SERVICE_URL}/process-pdf`,
      formData,
      { headers: ragAuthHeaders() },
    );

    // Provide the static URL back to the frontend
    const staticUrl = `/uploads/${path.basename(absoluteFilePath)}`;

    return res.json({
      message: "PDF uploaded & processed successfully!",
      session_id: response.data.session_id,
      session_secret: response.data.session_secret,
      document: response.data.document,
      documents: response.data.documents || [],
      url: staticUrl
    });
  } catch (err) {
    await cleanupFile(uploadedFilePath);

    const statusCode =
      err.response?.status || (err.code === "ECONNREFUSED" ? 502 : 500);
    const details = extractServiceDetails(err, "PDF processing failed");
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

  const { question, session_id, mode } = validation.data;

  try {
    const response = await axios.post(
      `${RAG_SERVICE_URL}/ask`,
      {
      question,
      session_id,
      mode,
      },
      { headers: ragAuthHeaders() },
    );

    return res.json({
      answer: response.data.answer,
      sources: response.data.sources ?? [],
      mode: response.data.mode ?? "default",
    });
  } catch (err) {
    const statusCode = err.response?.status || 500;
    const details = extractServiceDetails(err, "Error answering question");
    console.error("Question answering failed:", details);

    return res.status(statusCode).json({
      error: typeof details === "string" ? details : "Error answering question",
      details: isDevelopment ? details : "Internal processing error",
    });
  }
});
app.post("/ask/stream", inferenceSlowDown, inferenceLimiter, async (req, res) => {
  const validation = askSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      error: "Validation failed",
      details: validation.error.flatten(),
    });
  }

  const { question, session_id, mode } = validation.data;

  try {
    const ragResponse = await axios.post(
      `${RAG_SERVICE_URL}/ask/stream`,
      { question, session_id, mode },
      { responseType: "stream", timeout: 120000 }
    );

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    ragResponse.data.pipe(res);

    ragResponse.data.on("error", (err) => {
      console.error("Stream error from RAG service:", err.message);
      if (!res.headersSent) {
        res.status(502).json({ error: "Streaming response failed." });
      } else {
        res.end();
      }
    });
  } catch (err) {
    const statusCode = err.response?.status || (err.code === "ECONNREFUSED" ? 502 : 500);
    const details = extractServiceDetails(err, "Error answering question");
    console.error("Streaming question answering failed:", details);
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
    const response = await axios.post(`${RAG_SERVICE_URL}/summarize`, validation.data, {
      headers: ragAuthHeaders(),
    });

    return res.json({
      summary: response.data.summary,
    });
  } catch (err) {
    const statusCode = err.response?.status || 500;
    const details = extractServiceDetails(err, "Error summarizing PDF");
    console.error("Summarization failed:", details);

    return res.status(statusCode).json({
      error: typeof details === "string" ? details : "Error summarizing PDF",
      details: isDevelopment ? details : "Internal processing error",
    });
  }
});

app.get("/sessions", async (req, res) => {
  try {
    const response = await axios.get(`${RAG_SERVICE_URL}/sessions`, {
      headers: ragAuthHeaders(),
    });
    return res.json(response.data);
  } catch (err) {
    const statusCode = err.response?.status || 500;
    const details = extractServiceDetails(err);
    console.error("Failed to fetch sessions:", details);
    return res.status(statusCode).json({
      error: "Failed to fetch sessions",
      details: isDevelopment ? details : "Internal processing error",
    });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
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
  (async () => {
    if (redisConnectPromise) {
      console.log("[redis] connecting for distributed rate limiting...");
      await redisConnectPromise;
      console.log("[redis] connected");
    }

    const server = app.listen(PORT, () =>
      console.log(`Backend running on port ${PORT}`)
    );

    // ─── Server-Level Timeouts ───────────────────────────────────────────────
    // Slow-loris and connection-exhaustion attacks open connections and then
    // trickle data to keep the socket alive forever. These timeouts kill them.
    server.keepAliveTimeout = 65_000;  // 65 s — slightly above typical LB (60 s)
    server.headersTimeout = 70_000;    // Must be > keepAliveTimeout
    server.requestTimeout = 120_000;   // Max time to fully receive a request (2 min)
  })().catch((err) => {
    console.error("Backend failed to start:", err?.message || err);
    process.exitCode = 1;
  });
}

module.exports = { app, askSchema, summarizeSchema, extractServiceDetails };
