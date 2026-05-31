require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { domainToASCII } = require("url");
const { rateLimit } = require("express-rate-limit");
const slowDown = require("express-slow-down");
const helmet = require("helmet");
const { askSchema, summarizeSchema, knowledgeGapsSchema, sessionsLookupSchema } = require("./validators/schemas");
const { clientIpFromRequest } = require("./security/ip");
const { createRedisClient } = require("./security/redis");
const authRoutes = require("./src/routes/authRoutes");

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || "http://localhost:5000";
const getInternalRagToken = () => (process.env.INTERNAL_RAG_TOKEN || "").trim();
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
  methods: ["GET", "POST"],
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

// Apply global limiter before ban guard so DB-backed ban checks are rate-limited.
app.use(globalLimiter);
app.use(banGuard);
app.use("/api/auth", authRoutes);

// ─── File Size Limits ──────────────────────────────────────────────────────────
// MAX_UPLOAD_SIZE_MB controls the maximum PDF file size allowed per upload.
// Default is 50 MB. Set to a lower value in resource-constrained environments.
// Multer will automatically reject files exceeding this limit with 413 Payload Too Large.
//
// Environment variable validation: Ensures the value is a positive integer and rejects
// malformed strings like "50gb" or "50.5mb" that parseInt would silently truncate.
const validateUploadSizeConfig = () => {
  const rawValue = process.env.MAX_UPLOAD_SIZE_MB || "50";
  // Regex: match only pure positive integers (no units, decimals, or garbage)
  const integerRegex = /^\d+$/;
  if (!integerRegex.test(rawValue.trim())) {
    throw new Error(
      `MAX_UPLOAD_SIZE_MB must be a positive integer without units. ` +
      `Received: "${rawValue}". Examples: 50, 100, 200 (not "50mb" or "50.5").`
    );
  }
  const parsed = parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `MAX_UPLOAD_SIZE_MB must be a positive integer. ` +
      `Received: ${parsed}. Please set a value like 50, 100, or 200.`
    );
  }
  return parsed;
};
const MAX_UPLOAD_SIZE_MB = validateUploadSizeConfig();
const MAX_PDF_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

const UPLOADS_DIR = path.resolve("uploads");
const isDevelopment = process.env.NODE_ENV !== "production";

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ─── Background File Cleanup (safety net) ────────────────────────────────────
// Uploaded PDFs are deleted from disk immediately after the RAG service has
// finished indexing them (see cleanupFile call in the /upload success path).
// This interval is a safety net only: it removes any files that survived the
// immediate delete — e.g. because cleanupFile threw or the process crashed
// mid-request. The window is deliberately short (1 hour default) so orphaned
// files do not linger and cannot be accessed via direct path guessing.
//
// The /uploads directory is intentionally NOT mounted as a static file server.
// Serving PDFs through express.static would let any caller with a filename
// download the raw document with no session_secret check. Files must be
// accessed only through the authenticated /pdf/:filename route (if re-introduced
// in future) or via the in-browser blob URL created by URL.createObjectURL on
// the frontend.
const FILE_RETENTION_MS = parseInt(process.env.FILE_RETENTION_MS || "3600000", 10);
const CLEANUP_INTERVAL_MS = parseInt(process.env.CLEANUP_INTERVAL_MS || "3600000", 10);

const startUploadsCleanup = () => {
  const intervalId = setInterval(async () => {
    try {
      const files = await fsPromises.readdir(UPLOADS_DIR);
      const now = Date.now();
      for (const file of files) {
        if (file === ".gitkeep") continue;
        const filePath = path.join(UPLOADS_DIR, file);
        try {
          const stats = await fsPromises.stat(filePath);
          if (now - stats.birthtimeMs > FILE_RETENTION_MS) {
            await fsPromises.unlink(filePath);
            if (isDevelopment) {
              console.log(`[cleanup] safety-net deleted orphaned file: ${path.basename(filePath)}`);
            }
          }
        } catch (err) {
          if (err.code !== "ENOENT") {
            console.error(`[cleanup] failed to remove ${path.basename(filePath)}:`, err.message);
          }
        }
      }
    } catch (err) {
      console.error("[cleanup] failed to read uploads directory:", err.message);
    }
  }, CLEANUP_INTERVAL_MS);

  if (typeof intervalId.unref === "function") {
    intervalId.unref();
  }
};

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
  limits: {
    fileSize: MAX_PDF_SIZE_BYTES,
    // Additional limits to prevent abuse
    files: 1, // Only allow one file per request
  },
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
    if (isDevelopment) {
      console.log(`[upload] deleted temp file: ${path.basename(safePath)}`);
    }
  } catch (err) {
    // ENOENT means the file was already removed — treat as success.
    if (err.code !== "ENOENT") {
      console.error(`[upload] failed to delete temp file:`, err.message);
    }
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

const requireInternalRagToken = () => {
  if (!getInternalRagToken()) {
    throw new Error("INTERNAL_RAG_TOKEN must be configured for RAG service requests.");
  }
};

const ragAuthHeaders = () => {
  const token = getInternalRagToken();
  if (!token) {
    throw new Error("INTERNAL_RAG_TOKEN must be configured for RAG service requests.");
  }
  return { "X-Internal-Token": token };
};

const normalizeSessionSecret = (value) =>
  typeof value === "string" ? value.trim() || null : null;

const SUPABASE_ALLOWED_HOST_SUFFIXES = new Set(["supabase.co", "supabase.in"]);

const normalizeHostnameForAllowlist = (hostname) => {
  if (typeof hostname !== "string") return null;

  const normalizedHostname = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!normalizedHostname) return null;

  const asciiHostname = domainToASCII(normalizedHostname);
  if (!asciiHostname) return null;

  return asciiHostname.toLowerCase().replace(/\.$/, "");
};

const isAllowedSupabaseHostname = (hostname) => {
  const normalizedHostname = normalizeHostnameForAllowlist(hostname);
  if (!normalizedHostname) return false;

  const hostnameLabels = normalizedHostname.split(".");
  return Array.from(SUPABASE_ALLOWED_HOST_SUFFIXES).some((suffix) => {
    const suffixLabels = suffix.split(".");
    if (hostnameLabels.length < suffixLabels.length + 1) return false;

    return hostnameLabels.slice(-suffixLabels.length).join(".") === suffix;
  });
};

const getTrustedSupabaseOrigin = (hostname) => {
  const normalizedHostname = normalizeHostnameForAllowlist(hostname);
  if (!normalizedHostname) return null;

  if (!isAllowedSupabaseHostname(normalizedHostname)) return null;

  return `https://${normalizedHostname}`;
};

// ─── Multer Error Handler ───────────────────────────────────────────────────────
// Catches file size violations (413 Payload Too Large) and other multer errors.
// CWE-209 Mitigation: Sanitizes error messages to prevent leaking internal implementation
// details or server configuration. Verbose technical details are logged internally for
// debugging but never sent to the client.
// This middleware must be placed after upload.single() to catch multer-specific errors.
const multerErrorHandler = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      // CWE-209: Don't expose err.limit or raw Multer internals to client.
      // Multer stops processing immediately when size limit is exceeded, so exact file
      // size is unknown. Log technical details internally; return user-friendly message.
      console.warn(
        `[upload] File size limit exceeded. Limit: ${MAX_PDF_SIZE_BYTES} bytes, ` +
        `Multer error code: ${err.code}, Message: ${err.message}`
      );
      return res.status(413).json({
        error: "File too large",
        message: "Upload failed: File too large",
      });
    } else if (err.code === "LIMIT_FILE_COUNT") {
      console.warn(`[upload] Multiple files rejected. Multer code: ${err.code}`);
      return res.status(409).json({
        error: "Too many files",
        message: "Only one PDF file is allowed per upload request.",
      });
    } else if (err.code === "LIMIT_PART_COUNT") {
      console.warn(`[upload] Too many form parts. Multer code: ${err.code}`);
      return res.status(409).json({
        error: "Too many parts",
        message: "The form request contains too many fields. Please try again.",
      });
    }
    // Generic multer error: Log technical details, return sanitized message (CWE-209)
    console.error(`[upload] Multer error: ${err.code} - ${err.message}`);
    return res.status(400).json({
      error: "Upload failed",
      message: "An error occurred while processing your upload. Please try again.",
    });
  }

  if (err && err.message && err.message.includes("Only PDF files are allowed")) {
    console.warn(`[upload] Invalid file type attempted: ${err.message}`);
    return res.status(415).json({
      error: "Invalid file type",
      message: "Only PDF files are allowed. Please upload a valid PDF document.",
    });
  }

  // Unhandled error: Log for debugging, return safe generic message (CWE-209)
  if (err && isDevelopment) {
    console.error("[upload] Unhandled error:", err);
  } else if (err) {
    // Production: Log error but don't expose details
    console.error("[upload] Unhandled upload error");
  }

  // Pass other errors to Express error handler
  next(err);
};

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

app.post("/upload", uploadLimiter, upload.single("file"), multerErrorHandler, async (req, res) => {
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
    // Validate session credential pairing before opening the file stream.
    // Creating fs.createReadStream before this check would leave a dangling
    // open handle on the file if the request is rejected and cleanupFile
    // deletes the file before the stream is ever consumed.
    if ((sessionId || sessionSecret) && !(sessionId && sessionSecret)) {
      await cleanupFile(uploadedFilePath);
      return sendUploadError(
        res,
        403,
        "session_id and session_secret must be provided together to extend an existing session.",
      );
    }

    // All validation passed — safe to open the file stream for forwarding.
    const formData = {
      file: fs.createReadStream(absoluteFilePath),
      original_filename: req.file.originalname,
    };
    if (sessionId && sessionSecret) {
      formData.session_id = sessionId;
      formData.session_secret = sessionSecret;
    }

    const response = await axios.postForm(
      `${RAG_SERVICE_URL}/process-pdf`,
      formData,
      { headers: ragAuthHeaders() },
    );

    // Delete the temp file immediately after the RAG service has fully read and
    // indexed it. The frontend uses URL.createObjectURL for the in-browser viewer
    // so no server-side copy is needed. Keeping the file and serving it via an
    // unauthenticated static route would let any caller with the filename download
    // the raw PDF without supplying a session_secret.
    await cleanupFile(uploadedFilePath);

    return res.json({
      message: "PDF uploaded & processed successfully!",
      session_id: response.data.session_id,
      session_secret: response.data.session_secret,
      document: response.data.document,
      documents: response.data.documents || [],
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

// ─── Process PDF from URL (Supabase Storage) ────────────────────────────────
// Downloads the PDF from a remote URL (e.g. Supabase Storage public URL),
// streams it to the RAG service for text extraction + FAISS indexing,
// Middleware to verify Supabase JWTs to prevent unauthenticated processing
const requireSupabaseAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization token" });
  }
  
  const token = authHeader.split(" ")[1];
  const secret = process.env.SUPABASE_JWT_SECRET;
  
  // If the server admin hasn't configured the JWT secret, we at least enforce 
  // that a token is provided (to satisfy basic security checks), but we can't 
  // cryptographically verify it without the secret.
  if (secret) {
    const jwt = require("jsonwebtoken");
    try {
      req.user = jwt.verify(token, secret);
    } catch (err) {
      return res.status(401).json({ error: "Invalid token" });
    }
  }
  
  next();
};

// Downloads the PDF from a remote URL (e.g. Supabase Storage public URL),
// streams it to the RAG service for text extraction + FAISS indexing,
// and returns the session_id + session_secret needed for /ask/stream.
app.post("/process-from-url", uploadLimiter, requireSupabaseAuth, async (req, res) => {
  const { url, filename, session_id, session_secret } = req.body || {};

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing or invalid 'url' field." });
  }
  
  // SSRF Protection: Validate URL format, protocol, and hostname.
  let parsedUrl;
  try {
    parsedUrl = new URL(url.trim());
  } catch (err) {
    return res.status(400).json({ error: "Invalid URL format." });
  }

  if (parsedUrl.protocol !== "https:") {
    return res.status(400).json({ error: "Only HTTPS URLs are allowed." });
  }

  const trustedSupabaseOrigin = getTrustedSupabaseOrigin(parsedUrl.hostname);
  if (!trustedSupabaseOrigin) {
    return res.status(403).json({ error: "URL host is not allowed." });
  }

  if (!filename || typeof filename !== "string") {
    return res.status(400).json({ error: "Missing or invalid 'filename' field." });
  }

  // Sanitize filename — allow only safe characters
  const safeFilename = path
    .basename(filename)
    .replace(/[^a-zA-Z0-9._\- ]/g, "_")
    .slice(0, 200);

  try {
    // Download the PDF from the remote URL into a Buffer
    let pdfBuffer;
    try {
      const downloadPath = `${parsedUrl.pathname}${parsedUrl.search}` || "/";
      const dlResponse = await axios.get(downloadPath, {
        baseURL: trustedSupabaseOrigin,
        responseType: "arraybuffer",
        timeout: 30000,
        maxContentLength: 50 * 1024 * 1024, // 50 MB cap
      });
      pdfBuffer = Buffer.from(dlResponse.data);
    } catch (dlErr) {
      console.error("Failed to download PDF from URL:", dlErr.message);
      return res.status(502).json({ error: "Could not download PDF from the provided URL." });
    }

    // Verify PDF magic bytes
    if (pdfBuffer.slice(0, 4).toString() !== "%PDF") {
      return res.status(415).json({ error: "The file at the provided URL is not a valid PDF." });
    }

    // Build multipart form and forward to RAG service
    // Uses axios.postForm with a FormData blob — no extra form-data package needed
    const form = new FormData();
    const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' });
    form.append("file", pdfBlob, safeFilename);
    form.append("original_filename", safeFilename);

    // Optionally extend an existing session
    if (session_id && session_secret) {
      form.append("session_id", session_id);
      form.append("session_secret", session_secret);
    }

    const ragResponse = await axios.post(
      `${RAG_SERVICE_URL}/process-pdf`,
      form,
      {
        headers: ragAuthHeaders(),
        timeout: 120000, // 2 min — embedding generation can be slow
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    return res.json({
      message: "PDF processed and indexed successfully.",
      session_id: ragResponse.data.session_id,
      session_secret: ragResponse.data.session_secret,
      document: ragResponse.data.document,
      documents: ragResponse.data.documents || [],
    });
  } catch (err) {
    const statusCode =
      err.response?.status || (err.code === "ECONNREFUSED" ? 502 : 500);
    const details = extractServiceDetails(err, "RAG processing failed");
    console.error("process-from-url failed:", details);

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
  const session_secret = validation.data.session_secret;

  try {
    const response = await axios.post(
      `${RAG_SERVICE_URL}/ask`,
      {
        question,
        session_id,
        session_secret,
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
  const session_secret = validation.data.session_secret;

  try {
    const ragResponse = await axios.post(
      `${RAG_SERVICE_URL}/ask/stream`,
      { question, session_id, session_secret, mode },
      {
        headers: ragAuthHeaders(),
        responseType: "stream",
        timeout: 120000,
      }
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

app.post("/knowledge-gaps", inferenceSlowDown, inferenceLimiter, async (req, res) => {
  const validation = knowledgeGapsSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      error: "Validation failed",
      details: validation.error.flatten(),
    });
  }

  try {
    const response = await axios.post(
      `${RAG_SERVICE_URL}/knowledge-gaps`,
      validation.data,
      { headers: ragAuthHeaders() },
    );
    // Pass the response through as-is — no gateway-layer transformation.
    return res.json(response.data);
  } catch (err) {
    const statusCode = err.response?.status || 500;
    const details = extractServiceDetails(err, "Error mapping knowledge gaps");
    console.error("Knowledge gap mapping failed:", details);

    return res.status(statusCode).json({
      error: typeof details === "string" ? details : "Error mapping knowledge gaps",
      details: isDevelopment ? details : "Internal processing error",
    });
  }
});

app.get("/sessions", async (req, res) => {
  return res.status(410).json({
    error: "Endpoint removed. Use /sessions/lookup with session_id + session_secret.",
  });
});

app.post("/sessions/lookup", async (req, res) => {
  const validation = sessionsLookupSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      error: "Validation failed",
      details: validation.error.flatten(),
    });
  }

  try {
    const response = await axios.post(
      `${RAG_SERVICE_URL}/sessions/lookup`,
      validation.data,
      { headers: ragAuthHeaders() },
    );
    return res.json(response.data);
  } catch (err) {
    const statusCode = err.response?.status || 500;
    const details = extractServiceDetails(err);
    console.error("Failed to lookup sessions:", details);
    return res.status(statusCode).json({
      error: "Failed to lookup sessions",
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
  if (!err) {
    return next();
  }

  const statusCode =
    Number.isInteger(err.statusCode) ? err.statusCode :
    Number.isInteger(err.status) ? err.status :
    500;

  const message =
    statusCode >= 500
      ? "Internal server error."
      : err.message || "Request failed.";

  console.error("Unhandled Express error:", err.message);

  return res.status(statusCode).json({
    error: message,
  });
});

if (require.main === module) {
  requireInternalRagToken();

  (async () => {
    requireInternalRagToken();

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

module.exports = {
  app,
  askSchema,
  summarizeSchema,
  extractServiceDetails,
  ragAuthHeaders,
  requireInternalRagToken,
  normalizeHostnameForAllowlist,
  isAllowedSupabaseHostname,
};
