const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_FILES = 5;

const hashValue = (value) =>
  crypto.createHash("sha256").update(String(value ?? "")).digest("hex").slice(0, 16);

const createAuditLogger = (serviceName) => {
  const logFilePath = (process.env.AUDIT_LOG_FILE || "").trim();
  const maxBytes = Number.parseInt(process.env.AUDIT_LOG_MAX_BYTES || `${DEFAULT_MAX_BYTES}`, 10);
  const maxFiles = Number.parseInt(process.env.AUDIT_LOG_MAX_FILES || `${DEFAULT_MAX_FILES}`, 10);

  const serialize = (_, value) => {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }

    if (value && value.type === "Buffer" && Array.isArray(value.data)) {
      return `[buffer:${value.data.length}]`;
    }

    if (typeof value === "bigint") {
      return value.toString();
    }

    return value;
  };

  const rotateLogFileIfNeeded = (nextSize) => {
    if (!logFilePath || !Number.isFinite(maxBytes) || !Number.isFinite(maxFiles) || maxFiles < 1) {
      return;
    }

    try {
      const currentSize = fs.existsSync(logFilePath) ? fs.statSync(logFilePath).size : 0;
      if (currentSize + nextSize <= maxBytes) {
        return;
      }

      for (let index = maxFiles - 1; index >= 1; index -= 1) {
        const source = index === 1 ? logFilePath : `${logFilePath}.${index - 1}`;
        const target = `${logFilePath}.${index}`;

        if (fs.existsSync(source)) {
          if (fs.existsSync(target)) {
            fs.rmSync(target, { force: true });
          }

          fs.renameSync(source, target);
        }
      }
    } catch {
      // Best-effort rotation only.
    }
  };

  const appendToFile = (line) => {
    if (!logFilePath) {
      return;
    }

    const resolved = path.resolve(logFilePath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    rotateLogFileIfNeeded(Buffer.byteLength(`${line}\n`, "utf8"));
    fs.appendFileSync(resolved, `${line}\n`, "utf8");
  };

  const emit = (level, event, fields = {}) => {
    const payload = {
      timestamp: new Date().toISOString(),
      service: serviceName,
      level,
      event,
      ...fields,
    };

    const line = JSON.stringify(payload, serialize);
    process.stdout.write(`${line}\n`);

    try {
      appendToFile(line);
    } catch {
      // Never fail the request path because audit logging is unavailable.
    }

    return payload;
  };

  return {
    info: (event, fields = {}) => emit("info", event, fields),
    warn: (event, fields = {}) => emit("warn", event, fields),
    error: (event, fields = {}) => emit("error", event, fields),
    audit: (event, fields = {}) => emit("info", event, fields),
  };
};

module.exports = {
  createAuditLogger,
  hashValue,
};