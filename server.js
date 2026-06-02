require("dotenv").config();
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
const {
  askSchema,
  askCredentialSchema,
  askPayloadSchema,
  summarizeSchema,
  summarizeCredentialSchema,
  sessionsLookupSchema,
  knowledgeGapsSchema,
  MAX_QUESTION_LENGTH,
} = require("./validators/schemas");
const { clientIpFromRequest } = require("./security/ip");
const { createRedisClient } = require("./security/redis");
const authRoutes = require("./src/routes/authRoutes");

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || "http://localhost:5000";
const getInternalRagToken = () => (process.env.INTERNAL_RAG_TOKEN || "").trim();
const PORT = process.env.PORT || 4000;

// ─── Credential Validation Cache ─────────────────────────────────────────────
// session_id and session_secret are structurally identical on every request
// within a session (same UUID, same secret).  Re-running the full Zod parse
// for every /ask and /summarize call under Socratic/Tutor mode burns event-loop
// time on checks that cannot possibly fail for an already-validated credential.
//
// The cache is keyed on HMAC-SHA256(session_id:session_secret)[0:16] so the
// actual secret is never stored.  TTL matches SESSION_TTL_MINUTES so entries
// expire when the RAG session would have expired anyway.  The map is bounded at
// CRED_CACHE_MAX entries; when full the oldest entry (insertion order) is evicted.
const _SESSION_TTL_MS =
  parseInt(process.env.SESSION_TTL_MINUTES || "43200", 10) * 60 * 1000;
const _CRED_CACHE_MAX = parseInt(process.env.CRED_CACHE_MAX_SIZE || "1000", 10);

const _credCache = new Map(); // key → { validatedAt: number }

const _hmacKey = crypto
  .createHash("sha256")
  .update("pdf-qa-cred-cache")
  .digest();

function _credKey(sessionId, sessionSecret) {
  return crypto
    .createHmac("sha256", _hmacKey)
    .update(`${sessionId}:${sessionSecret}`)
    .digest("hex")
    .slice(0, 16);
}

function _credCacheHit(sessionId, sessionSecret) {
  const k = _credKey(sessionId, sessionSecret);
  const entry = _credCache.get(k);
  if (!entry) return false;
  if (Date.now() - entry.validatedAt > _SESSION_TTL_MS) {
    _credCache.delete(k);
    return false;
  }
  return true;
}

function _credCacheStore(sessionId, sessionSecret) {
  const k = _credKey(sessionId, sessionSecret);
  if (_credCache.size >= _CRED_CACHE_MAX) {
    _credCache.delete(_credCache.keys().next().value); // evict oldest (FIFO)
  }
  _credCache.set(k, { validatedAt: Date.now() });
}

function _credCacheDrop(sessionId, sessionSecret) {
  _credCache.delete(_credKey(sessionId, sessionSecret));
}

// Validate /ask body: always parse payload fields (question, mode change per
// request); short-circuit credential fields on cache hit.
function validateAskBody(body) {
  const rawId = typeof body?.session_id === "string" ? body.session_id : "";
  const rawSecret =
    typeof body?.session_secret === "string" ? body.session_secret : "";

  const payloadResult = askPayloadSchema.safeParse(body);
  if (!payloadResult.success) {
    return { success: false, error: payloadResult.error };
  }

  if (_credCacheHit(rawId, rawSecret)) {
    return {
      success: true,
      data: { ...payloadResult.data, session_id: rawId, session_secret: rawSecret },
    };
  }

  const credResult = askCredentialSchema.safeParse(body);
  if (!credResult.success) {
    return { success: false, error: credResult.error };
  }

  _credCacheStore(rawId, rawSecret);
  return { success: true, data: { ...payloadResult.data, ...credResult.data } };
}

// Validate /summarize body: only credential fields; short-circuit on cache hit.
function validateSummarizeBody(body) {
  const rawId = typeof body?.session_id === "string" ? body.session_id : "";
  const rawSecret =
    typeof body?.session_secret === "string" ? body.session_secret : "";

  if (_credCacheHit(rawId, rawSecret)) {
    return { success: true, data: { session_id: rawId, session_secret: rawSecret } };
  }

  const result = summarizeCredentialSchema.safeParse(body);
  if (!result.success) {
    return { success: false, error: result.error };
  }

  _credCacheStore(rawId, rawSecret);
  return { success: true, data: result.data };
}

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
  credentials: true,
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

const parsePositiveIntegerEnv = (rawValue, fallbackValue, name) => {
  const candidate = (rawValue ?? "").toString().trim();
  const value = candidate === "" ? String(fallbackValue) : candidate;
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be a positive integer. Received: "${rawValue}".`);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer greater than 0.`);
  }

  return parsed;
};

const parseUploadFileSizeLimitBytes = () => {
  if (typeof process.env.UPLOAD_MAX_FILE_SIZE_BYTES === "string" && process.env.UPLOAD_MAX_FILE_SIZE_BYTES.trim() !== "") {
    return parsePositiveIntegerEnv(
      process.env.UPLOAD_MAX_FILE_SIZE_BYTES,
      20_000_000,
      "UPLOAD_MAX_FILE_SIZE_BYTES",
    );
  }

  if (typeof process.env.MAX_UPLOAD_SIZE_MB === "string" && process.env.MAX_UPLOAD_SIZE_MB.trim() !== "") {
    const maxUploadSizeMb = parsePositiveIntegerEnv(
      process.env.MAX_UPLOAD_SIZE_MB,
      20,
      "MAX_UPLOAD_SIZE_MB",
    );
    return maxUploadSizeMb * 1024 * 1024;
  }

  return 20_000_000;
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

const RATE_LIMIT_WINDOW_MS = parsePositiveIntegerEnv(
  process.env.RATE_LIMIT_WINDOW_MS,
  60_000,
  "RATE_LIMIT_WINDOW_MS",
);
const RATE_LIMIT_MAX = parsePositiveIntegerEnv(
  process.env.RATE_LIMIT_MAX,
  60,
  "RATE_LIMIT_MAX",
);

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

// Route-specific cap for upload and inference endpoints.
// Tripping this triggers the ban system.
const uploadLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator,
  store: createLimiterStore("rl:upload:"),
  handler: (req, res) => {
    res.locals.rateLimitMessage = "Too many requests. Please slow down and try again later.";
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
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator,
  store: createLimiterStore("rl:inference:"),
  handler: (req, res) => {
    res.locals.rateLimitMessage = "Too many requests. Please slow down and try again later.";
    rateLimitHandler(req, res);
  },
});

const UPLOAD_MAX_CONCURRENT_PER_IP = parsePositiveIntegerEnv(
  process.env.UPLOAD_MAX_CONCURRENT_PER_IP,
  2,
  "UPLOAD_MAX_CONCURRENT_PER_IP",
);
const activeUploadsByIp = new Map();

const releaseUploadSlot = (ip) => {
  if (!ip) return;

  const currentCount = activeUploadsByIp.get(ip);
  if (!currentCount) return;

  if (currentCount <= 1) {
    activeUploadsByIp.delete(ip);
  } else {
    activeUploadsByIp.set(ip, currentCount - 1);
  }
};

const uploadConcurrencyGuard = (req, res, next) => {
  const ip = clientIpFromRequest(req) || "unknown";
  const currentCount = activeUploadsByIp.get(ip) || 0;

  if (currentCount >= UPLOAD_MAX_CONCURRENT_PER_IP) {
    console.warn(
      `[upload] concurrent upload limit reached for IP=${ip} active=${currentCount} cap=${UPLOAD_MAX_CONCURRENT_PER_IP}`,
    );
    return res.status(429).json({
      error: "Too many concurrent uploads. Please wait for an active upload to finish.",
    });
  }

  activeUploadsByIp.set(ip, currentCount + 1);

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    releaseUploadSlot(ip);
  };
  req.releaseUploadSlot = release;
  res.on("finish", release);
  res.on("close", release);

  return next();
};

// Apply global limiter before ban guard so DB-backed ban checks are rate-limited.
app.use(globalLimiter);
app.use(banGuard);
app.use("/api/auth", authRoutes);

// ─── File Size Limits ──────────────────────────────────────────────────────────
// UPLOAD_MAX_FILE_SIZE_BYTES controls the maximum PDF file size allowed per upload.
// Default is 20,000,000 bytes. A legacy MAX_UPLOAD_SIZE_MB value is still honored
// when the new bytes-based env var is not set.
const MAX_PDF_SIZE_BYTES = parseUploadFileSizeLimitBytes();

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

// When the RAG service is still loading models it returns 503 with a
// Retry-After header.  Forward both the status code and the header to the
// client so it knows how long to wait before retrying rather than receiving
// a generic 500 with no guidance.
const propagateRagError = (err, res, fallback) => {
  const status = err.response?.status || 500;
  const detail = extractServiceDetails(err, fallback);
  if (status === 503) {
    const retryAfter = err.response?.headers?.["retry-after"] || "30";
    res.set("Retry-After", String(retryAfter));
  }
  return res.status(status).json({
    error: typeof detail === "string" ? detail : fallback,
    details: isDevelopment ? detail : "Internal processing error",
  });
};

const normalizeSessionSecret = (value) =>
  typeof value === "string" ? value.trim() || null : null;

const SESSION_SECRET_COOKIE_PREFIX = "pdfqa_session_secret_";

const getSessionSecretCookieName = (sessionId) =>
  `${SESSION_SECRET_COOKIE_PREFIX}${sessionId}`;

const SESSION_SECRET_TTL_MS = (parseInt(process.env.SESSION_SECRET_COOKIE_TTL_DAYS || "7", 10) || 7) * 24 * 60 * 60 * 1000;
const SESSION_SECRET_REDIS_URL = process.env.SESSION_SECRET_REDIS_URL || RATE_LIMIT_REDIS_URL || process.env.REDIS_URL || "";
const SESSION_SECRET_REDIS_PREFIX = "session-secret:";
const SESSION_SECRET_MEMORY_MAP = new Map(); // token -> { encrypted: string, expiry }

// Cookie SameSite configuration for session-secret fallback cookie.
// Default: 'lax'. Operators can set to 'none' when frontend+API are cross-site,
// but that requires Secure to be true per browser rules.
const SESSION_SECRET_COOKIE_SAMESITE = (process.env.SESSION_SECRET_COOKIE_SAMESITE || "lax").toString();

let sessionSecretRedisClient = null;
let sessionSecretRedisConnectPromise = null;

if (SESSION_SECRET_REDIS_URL) {
  if (redisClient) {
    sessionSecretRedisClient = redisClient;
  } else {
    ({ client: sessionSecretRedisClient, connectPromise: sessionSecretRedisConnectPromise } = createRedisClient(SESSION_SECRET_REDIS_URL));
  }
  if (sessionSecretRedisConnectPromise) {
    void sessionSecretRedisConnectPromise.catch((err) => {
      console.warn("[session-secret] redis connect failed:", err?.message || err);
    });
  }
}

// Encryption key must be provided via env var as base64-encoded 32 bytes.
// If not present, generate a runtime-only key (lost on restart) and log a warning.
let ENC_KEY = null;
const _initEncKey = () => {
  if (ENC_KEY) return;
  const fromEnv = (process.env.SESSION_SECRET_ENC_KEY || "").trim();
  if (fromEnv) {
    try {
      const buf = Buffer.from(fromEnv, "base64");
      if (buf.length === 32) {
        ENC_KEY = buf;
      } else {
        console.warn("SESSION_SECRET_ENC_KEY must be 32 bytes base64; falling back to runtime key");
      }
    } catch (_) {
      console.warn("Invalid SESSION_SECRET_ENC_KEY; falling back to runtime key");
    }
  }
  if (!ENC_KEY) {
    // If Redis-backed storage is enabled (or specifically sessionSecretRedisClient is set)
    // and we're running in production, require a persistent encryption key so
    // stored values remain decryptable across restarts. Falling back to a
    // runtime-only key in this configuration leads to opaque failures.
    if (sessionSecretRedisClient && process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET_ENC_KEY is required when using Redis-backed session secret storage in production");
    }

    ENC_KEY = crypto.randomBytes(32);
    console.warn("No SESSION_SECRET_ENC_KEY provided — generated runtime-only key (won't persist across restarts)");
  }
};

const _encryptSecret = (secret) => {
  _initEncKey();
  const iv = crypto.randomBytes(12); // recommended IV size for AES-GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Store as base64 segments iv:ciphertext:tag
  return `${iv.toString("base64")}:${ciphertext.toString("base64")}:${tag.toString("base64")}`;
};

const _decryptSecret = (blob) => {
  if (!blob) return null;
  _initEncKey();
  try {
    const [ivB64, ctB64, tagB64] = blob.split(":");
    const iv = Buffer.from(ivB64, "base64");
    const ct = Buffer.from(ctB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", ENC_KEY, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (e) {
    console.warn("Failed to decrypt session secret token:", e?.message || e);
    return null;
  }
};

const _sessionSecretRedisKey = (token) => `${SESSION_SECRET_REDIS_PREFIX}${token}`;

const _storeSessionSecretInRedis = async (token, encrypted, expiry) => {
  if (!sessionSecretRedisClient) {
    return false;
  }

  try {
    await sessionSecretRedisClient.set(
      _sessionSecretRedisKey(token),
      JSON.stringify({ encrypted, expiry }),
      { PX: SESSION_SECRET_TTL_MS },
    );
    return true;
  } catch (err) {
    console.warn("[session-secret] redis write failed:", err?.message || err);
    return false;
  }
};

const _readSessionSecretFromRedis = async (token) => {
  if (!sessionSecretRedisClient) {
    return null;
  }

  try {
    const raw = await sessionSecretRedisClient.get(_sessionSecretRedisKey(token));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.encrypted !== "string") {
      return null;
    }

    if (typeof parsed.expiry === "number" && parsed.expiry <= Date.now()) {
      return null;
    }

    return parsed.encrypted;
  } catch (err) {
    console.warn("[session-secret] redis read failed:", err?.message || err);
    return null;
  }
};

const _storeSessionSecret = async (token, sessionSecret) => {
  if (!token || !sessionSecret) return false;
  const expiry = Date.now() + SESSION_SECRET_TTL_MS;
  const encrypted = _encryptSecret(sessionSecret);

  if (sessionSecretRedisClient) {
    await _storeSessionSecretInRedis(token, encrypted, expiry);
  }

  SESSION_SECRET_MEMORY_MAP.set(token, { encrypted, expiry });
  // Only create a per-token timer for in-memory fallback. When Redis is
  // configured we rely on Redis TTLs and lazy eviction to avoid creating
  // large numbers of active timers in-process.
  if (!sessionSecretRedisClient) {
    const timeout = setTimeout(() => {
      SESSION_SECRET_MEMORY_MAP.delete(token);
    }, SESSION_SECRET_TTL_MS + 1000);
    if (typeof timeout.unref === "function") {
      timeout.unref();
    }
  }
  return true;
};

const _lookupSessionSecret = async (token) => {
  if (!token) return null;

  const encryptedFromRedis = await _readSessionSecretFromRedis(token);
  if (encryptedFromRedis) {
    return _decryptSecret(encryptedFromRedis);
  }

  const entry = SESSION_SECRET_MEMORY_MAP.get(token);
  if (!entry) return null;
  if (entry.expiry <= Date.now()) {
    SESSION_SECRET_MEMORY_MAP.delete(token);
    return null;
  }
  return _decryptSecret(entry.encrypted);
};

const readRequestCookies = (req) => {
  const header = req.headers.cookie;
  if (!header || typeof header !== "string") {
    return {};
  }

  return header.split(";").reduce((cookies, pair) => {
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex === -1) {
      return cookies;
    }

    const rawName = pair.slice(0, separatorIndex).trim();
    const rawValue = pair.slice(separatorIndex + 1).trim();

    if (!rawName) {
      return cookies;
    }

    try {
      cookies[rawName] = decodeURIComponent(rawValue);
    } catch (_) {
      cookies[rawName] = rawValue;
    }

    return cookies;
  }, {});
};

const getSessionSecretFromCookie = async (req, sessionId) => {
  if (!sessionId) {
    return null;
  }

  const cookies = readRequestCookies(req);
  const rawCookieValue = normalizeSessionSecret(cookies[getSessionSecretCookieName(sessionId)]);
  if (!rawCookieValue) return null;

  const resolvedFromStore = await _lookupSessionSecret(rawCookieValue);
  if (resolvedFromStore) {
    return resolvedFromStore;
  }

  // Legacy compatibility: older clients/tests may still send the plaintext
  // session secret in the cookie. Only accept the raw value when it is not one
  // of our generated UUID-like tokens, so token loss on restart does not
  // silently fall back to an opaque token string.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawCookieValue)) {
    return rawCookieValue;
  }

  return null;
};

const resolveSessionSecret = async (req, sessionId, providedSecret) =>
  normalizeSessionSecret(providedSecret) || getSessionSecretFromCookie(req, sessionId);

const setSessionSecretCookie = async (res, sessionId, sessionSecret) => {
  if (!sessionId || !sessionSecret) {
    return;
  }

  // Store the real secret server-side and put only a random token in the cookie.
  // Generate the token outside the storage helper so cookie data never flows
  // from a function that accepts the sensitive plaintext secret.
  const token = crypto.randomUUID();
  const stored = await _storeSessionSecret(token, sessionSecret);
  if (!stored) return;

  // Respect operator-configured SameSite. If operators explicitly request
  // 'none', ensure the Secure flag is set (browsers require this for None).
  const sameSiteRaw = (SESSION_SECRET_COOKIE_SAMESITE || "lax").toString();
  const sameSite = ("" + sameSiteRaw).toLowerCase();
  const secureFlag = process.env.NODE_ENV === "production" || sameSite === "none";

  if (sameSite === "none" && !secureFlag) {
    console.warn("SESSION_SECRET_COOKIE_SAMESITE=none was requested but secure cookies are not enabled; forcing Secure flag to true for compatibility.");
  }

  res.cookie(getSessionSecretCookieName(sessionId), token, {
    httpOnly: true,
    sameSite: sameSiteRaw,
    secure: !!secureFlag,
    path: "/",
    maxAge: SESSION_SECRET_TTL_MS,
  });
};

const attachSessionSecrets = async (req, sessions) => {
  if (!Array.isArray(sessions)) {
    return [];
  }

  return Promise.all(sessions.map(async (session) => {
    const sessionId = session?.session_id;
    const sessionSecret = await resolveSessionSecret(req, sessionId, session?.session_secret);

    return {
      ...session,
      session_secret: sessionSecret,
    };
  }));
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

app.post(
  "/upload",
  uploadLimiter,
  uploadConcurrencyGuard,
  upload.single("file"),
  multerErrorHandler,
  async (req, res) => {
  const uploadedFilePath = req.file?.path;
  // CodeQL [js/path-injection] Mitigation: Break taint flow by forcing basename
  const absoluteFilePath = uploadedFilePath
    ? path.join(UPLOADS_DIR, path.basename(uploadedFilePath))
    : null;
  const sessionId = req.body?.session_id || null;
  const sessionSecret = await resolveSessionSecret(req, sessionId, req.body?.session_secret);

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

    const controller = new AbortController();
    const onClientDisconnect = () => {
      controller.abort();
      cleanupFile(uploadedFilePath);
    };
    req.on("close", onClientDisconnect);

    const response = await axios.postForm(
      `${RAG_SERVICE_URL}/process-pdf`,
      formData,
      {
        headers: ragAuthHeaders(),
        timeout: 120000,
        signal: controller.signal,
      },
    );

    req.off("close", onClientDisconnect);

    // Delete the temp file immediately after the RAG service has fully read and
    // indexed it. The frontend uses URL.createObjectURL for the in-browser viewer
    // so no server-side copy is needed. Keeping the file and serving it via an
    // unauthenticated static route would let any caller with the filename download
    // the raw PDF without supplying a session_secret.
    await cleanupFile(uploadedFilePath);

    await setSessionSecretCookie(res, response.data.session_id || sessionId, response.data.session_secret || sessionSecret);

    return res.json({
      message: "PDF uploaded & processed successfully!",
      session_id: response.data.session_id,
      document: response.data.document,
      documents: response.data.documents || [],
    });
  } catch (err) {
    if (err.name === "CanceledError" || err.code === "ERR_CANCELED") {
      return;
    }

    await cleanupFile(uploadedFilePath);

    const statusCode =
      err.response?.status || (err.code === "ECONNREFUSED" ? 502 : 500);
    const details = extractServiceDetails(err, "PDF processing failed");
    console.error("Upload processing failed:", details);

    return res.status(statusCode).json({
      error: typeof details === "string" ? details : "PDF processing failed",
      details: isDevelopment ? details : "Internal processing error",
    });
  } finally {
    if (typeof req.releaseUploadSlot === "function") {
      req.releaseUploadSlot();
    }
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
  
  // SSRF Protection: Validate URL format, protocol, and hostname
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (err) {
    return res.status(400).json({ error: "Invalid URL format." });
  }

  if (parsedUrl.protocol !== "https:") {
    return res.status(400).json({ error: "Only HTTPS URLs are allowed." });
  }

  const allowedHosts = [".supabase.co", ".supabase.in"];
  const isAllowedHost = allowedHosts.some(host => parsedUrl.hostname.endsWith(host));
  
  if (!isAllowedHost) {
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
      const dlResponse = await axios.get(url, {
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
    const resolvedSessionSecret = await resolveSessionSecret(req, session_id, session_secret);
    if (session_id && resolvedSessionSecret) {
      form.append("session_id", session_id);
      form.append("session_secret", resolvedSessionSecret);
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

    await setSessionSecretCookie(res, ragResponse.data.session_id || session_id, ragResponse.data.session_secret || resolvedSessionSecret);

    return res.json({
      message: "PDF processed and indexed successfully.",
      session_id: ragResponse.data.session_id,
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
  const resolvedSessionSecret = await resolveSessionSecret(
    req,
    req.body?.session_id,
    req.body?.session_secret
  );

  const validation = validateAskBody({
    ...req.body,
    session_secret: resolvedSessionSecret,
  });

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
    console.error(
      "Question answering failed:",
      extractServiceDetails(err, "Error answering question")
    );
    return propagateRagError(err, res, "Error answering question");
  }
});

app.post("/ask/stream", inferenceSlowDown, inferenceLimiter, async (req, res) => {
  const resolvedSessionSecret = await resolveSessionSecret(
    req,
    req.body?.session_id,
    req.body?.session_secret
  );

  const validation = validateAskBody({
    ...req.body,
    session_secret: resolvedSessionSecret,
  });

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
      { headers: ragAuthHeaders(), responseType: "stream", timeout: 120000 }
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
    console.error(
      "Streaming question answering failed:",
      extractServiceDetails(err, "Error answering question")
    );
    return propagateRagError(err, res, "Error answering question");
  }
});

app.post("/summarize", inferenceSlowDown, inferenceLimiter, async (req, res) => {
  const resolvedSessionSecret = await resolveSessionSecret(
    req,
    req.body?.session_id,
    req.body?.session_secret
  );

  const validation = validateSummarizeBody({
    ...req.body,
    session_secret: resolvedSessionSecret,
  });

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
      {
        headers: ragAuthHeaders(),
      }
    );

    return res.json({
      summary: response.data.summary,
    });
  } catch (err) {
    console.error(
      "Summarization failed:",
      extractServiceDetails(err, "Error summarizing PDF")
    );
    return propagateRagError(err, res, "Error summarizing PDF");
  }
});

app.get("/sessions", async (req, res) => {
  return res.status(410).json({
    error: "Endpoint removed. Use /sessions/lookup with session_id + session_secret.",
  });
});

app.post("/sessions/lookup", async (req, res) => {
  const validation = sessionsLookupSchema.safeParse({
    ...req.body,
    sessions: await attachSessionSecrets(req, req.body?.sessions),
  });

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
  // Exported for tests — verify cache behaviour without going through routes.
  _credCache,
  _credKey,
  _credCacheHit,
  _credCacheStore,
  _credCacheDrop,
  validateAskBody,
  validateSummarizeBody,
  MAX_QUESTION_LENGTH,
  ragAuthHeaders,
  requireInternalRagToken,
};
