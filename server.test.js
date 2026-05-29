const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { spawnSync } = require("node:child_process");
const axios = require("axios");
const { Blob } = require("node:buffer");

const originalInternalRagToken = process.env.INTERNAL_RAG_TOKEN;
const originalJwtSecret = process.env.JWT_SECRET;

before(() => {
  process.env.INTERNAL_RAG_TOKEN = process.env.INTERNAL_RAG_TOKEN || "test-internal-rag-token";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
});

after(() => {
  if (originalInternalRagToken === undefined) {
    delete process.env.INTERNAL_RAG_TOKEN;
  } else {
    process.env.INTERNAL_RAG_TOKEN = originalInternalRagToken;
  }

  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

// Module-load test: would throw at require time if any undefined
// variable (e.g. fsSync) or broken import exists
let app, askSchema, summarizeSchema, extractServiceDetails;
let bannedIPs, recordOffence, BAN_DURATIONS_MS;
let app, askSchema, summarizeSchema, extractServiceDetails, ragAuthHeaders;
let clientIpFromRequest, normalizeIp;
before(() => {
  process.env.JWT_SECRET = "test-secret-for-ci";
  const mod = require("./server.js");
  app = mod.app;
  askSchema = mod.askSchema;
  summarizeSchema = mod.summarizeSchema;
  extractServiceDetails = mod.extractServiceDetails;
  bannedIPs = mod.bannedIPs;
  recordOffence = mod.recordOffence;
  BAN_DURATIONS_MS = mod.BAN_DURATIONS_MS;
  ragAuthHeaders = mod.ragAuthHeaders;

  ({ clientIpFromRequest, normalizeIp } = require("./security/ip"));
});

test("module loads without error", () => {
  assert.ok(typeof app === "function", "app should be an Express app");
  assert.ok(typeof askSchema.safeParse === "function", "askSchema should be a Zod schema");
  assert.ok(typeof summarizeSchema.safeParse === "function", "summarizeSchema should be a Zod schema");
  assert.ok(typeof extractServiceDetails === "function", "extractServiceDetails should be exported for tests");
  assert.ok(bannedIPs instanceof Map, "bannedIPs should be a Map");
  assert.ok(typeof recordOffence === "function", "recordOffence should be exported");
  assert.ok(Array.isArray(BAN_DURATIONS_MS), "BAN_DURATIONS_MS should be an array");
});

test("ragAuthHeaders forwards the internal token", () => {
  assert.deepEqual(ragAuthHeaders(), { "X-Internal-Token": process.env.INTERNAL_RAG_TOKEN.trim() });
});

test("server module can be imported when INTERNAL_RAG_TOKEN is unset", () => {
  const result = spawnSync(
    process.execPath,
    ["-e", "require('./server.js')"],
    {
      cwd: __dirname,
      env: {
        ...process.env,
        INTERNAL_RAG_TOKEN: "",
        JWT_SECRET: "test-jwt-secret",
      },
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0);
});

test("server startup fails when INTERNAL_RAG_TOKEN is unset", () => {
  const result = spawnSync(
    process.execPath,
    ["server.js"],
    {
      cwd: __dirname,
      env: {
        ...process.env,
        INTERNAL_RAG_TOKEN: "",
        JWT_SECRET: "test-jwt-secret",
      },
      encoding: "utf8",
      timeout: 5000,
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}${result.stdout}`, /INTERNAL_RAG_TOKEN must be configured/);
});

const createPdfUploadBody = ({ sessionId = null, sessionSecret = null } = {}) => {
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF")], {
      type: "application/pdf",
    }),
    "sample.pdf",
  );

  if (sessionId) {
    formData.append("session_id", sessionId);
  }

  if (sessionSecret) {
    formData.append("session_secret", sessionSecret);
  }

  return formData;
};

const consumeUploadStream = (formData) =>
  new Promise((resolve, reject) => {
    const stream = formData?.file;
    if (!stream || typeof stream.on !== "function") {
      resolve();
      return;
    }

    stream.on("end", resolve);
    stream.on("error", reject);
    stream.resume();
  });

describe("IP normalization", () => {
  test("normalizeIp strips IPv4-mapped IPv6 prefix", () => {
    assert.equal(normalizeIp("::ffff:127.0.0.1"), "127.0.0.1");
  });

  test("clientIpFromRequest prefers req.ip and normalizes it", () => {
    const ip = clientIpFromRequest({ ip: "::ffff:10.0.0.5", socket: {} });
    assert.equal(ip, "10.0.0.5");
  });
});

describe("service error extraction", () => {
  test("falls back when upstream details are empty", () => {
    const details = extractServiceDetails(
      { response: { data: { detail: "" } }, message: "" },
      "PDF processing failed",
    );

    assert.equal(details, "PDF processing failed");
  });

  test("extracts nested upstream detail", () => {
    const details = extractServiceDetails({
      response: { data: { detail: { error: "Unable to read this PDF." } } },
      message: "Request failed",
    });

    assert.equal(details, "Unable to read this PDF.");
  });
});

describe("askSchema validation", () => {
  test("accepts valid input", () => {
    const result = askSchema.safeParse({
      question: "What is this PDF about?",
      session_id: "550e8400-e29b-41d4-a716-446655440000",
      session_secret: "session-secret-123",
    });
    assert.equal(result.success, true);
  });

  test("rejects empty question", () => {
    const result = askSchema.safeParse({
      question: "",
      session_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    assert.equal(result.success, false);
  });

  test("rejects missing session_id", () => {
    const result = askSchema.safeParse({
      question: "What is this PDF about?",
    });
    assert.equal(result.success, false);
  });

  test("rejects non-UUID session_id", () => {
    const result = askSchema.safeParse({
      question: "What is this PDF about?",
      session_id: "not-a-uuid",
    });
    assert.equal(result.success, false);
  });
});

describe("summarizeSchema validation", () => {
  test("accepts valid input", () => {
    const result = summarizeSchema.safeParse({
      session_id: "550e8400-e29b-41d4-a716-446655440000",
      session_secret: "session-secret-123",
    });
    assert.equal(result.success, true);
  });

  test("rejects missing session_id", () => {
    const result = summarizeSchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("rejects empty session_id", () => {
    const result = summarizeSchema.safeParse({
      session_id: "",
    });
    assert.equal(result.success, false);
  });
});

// ── session_secret schema validation — regression tests for issue #234 ────────
//
// These tests verify that the Zod schemas reject requests carrying empty,
// whitespace-only, or missing session_secret values. This is the server-side
// boundary check that prevents a caller from omitting the credential and
// gaining access to sessions they do not own.
//
// The root fix (sessionStorage instead of localStorage) lives in the frontend,
// but schema enforcement here ensures that even if a client sends a malformed
// or stripped secret, the Express gateway rejects it before forwarding the
// request to the RAG service.
describe("session_secret schema enforcement", () => {
  test("askSchema rejects missing session_secret", () => {
    const result = askSchema.safeParse({
      question: "What is this document about?",
      session_id: "550e8400-e29b-41d4-a716-446655440000",
      // session_secret intentionally omitted
    });
    assert.equal(result.success, false);
    const errors = result.error.flatten().fieldErrors;
    assert.ok(
      errors.session_secret,
      "Expected validation error on session_secret field",
    );
  });

  test("askSchema rejects empty string session_secret", () => {
    const result = askSchema.safeParse({
      question: "What is this document about?",
      session_id: "550e8400-e29b-41d4-a716-446655440000",
      session_secret: "",
    });
    assert.equal(result.success, false);
    const errors = result.error.flatten().fieldErrors;
    assert.ok(errors.session_secret);
  });

  test("askSchema rejects whitespace-only session_secret", () => {
    const result = askSchema.safeParse({
      question: "What is this document about?",
      session_id: "550e8400-e29b-41d4-a716-446655440000",
      session_secret: "   ",
    });
    assert.equal(result.success, false);
    const errors = result.error.flatten().fieldErrors;
    assert.ok(errors.session_secret);
  });

  test("askSchema accepts non-empty session_secret", () => {
    const result = askSchema.safeParse({
      question: "What is this document about?",
      session_id: "550e8400-e29b-41d4-a716-446655440000",
      session_secret: "valid-secret-value",
    });
    assert.equal(result.success, true);
  });

  test("summarizeSchema rejects missing session_secret", () => {
    const result = summarizeSchema.safeParse({
      session_id: "550e8400-e29b-41d4-a716-446655440000",
      // session_secret intentionally omitted
    });
    assert.equal(result.success, false);
    const errors = result.error.flatten().fieldErrors;
    assert.ok(
      errors.session_secret,
      "Expected validation error on session_secret field",
    );
  });

  test("summarizeSchema rejects empty string session_secret", () => {
    const result = summarizeSchema.safeParse({
      session_id: "550e8400-e29b-41d4-a716-446655440000",
      session_secret: "",
    });
    assert.equal(result.success, false);
    const errors = result.error.flatten().fieldErrors;
    assert.ok(
      errors.session_secret,
      "Expected validation error on session_secret field",
    );
  });

  test("summarizeSchema rejects whitespace-only session_secret", () => {
    const result = summarizeSchema.safeParse({
      session_id: "550e8400-e29b-41d4-a716-446655440000",
      session_secret: "  \t  ",
    });
    assert.equal(result.success, false);
    const errors = result.error.flatten().fieldErrors;
    assert.ok(
      errors.session_secret,
      "Expected validation error on session_secret field",
    );
  });

  test("summarizeSchema accepts non-empty session_secret", () => {
    const result = summarizeSchema.safeParse({
      session_id: "550e8400-e29b-41d4-a716-446655440000",
      session_secret: "any-non-empty-secret",
    });
    assert.equal(result.success, true);
  });
});

describe("route error responses", () => {
  let server;
  let baseUrl;

  before(() => {
    return new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(() => {
    if (server) server.close();
  });

  test("POST /ask with empty body returns 400", async () => {
    const res = await fetch(`${baseUrl}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, "Validation failed");
    assert.deepEqual(data.details.fieldErrors.question, ["Question is required."]);
  });

  test("POST /ask with invalid session_id returns 400", async () => {
    const res = await fetch(`${baseUrl}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "hi", session_id: "bad" }),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, "Validation failed");
    assert.deepEqual(data.details.fieldErrors.session_id, ["Invalid session ID format."]);
  });

  test("POST /summarize with empty body returns 400", async () => {
    const res = await fetch(`${baseUrl}/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, "Validation failed");
    assert.deepEqual(data.details.fieldErrors.session_id, ["session_id is required."]);
  });

  test("POST /summarize with missing session_id returns 400", async () => {
    const res = await fetch(`${baseUrl}/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "" }),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, "Validation failed");
    assert.deepEqual(data.details.fieldErrors.session_id, ["session_id is required."]);
  });

  test("POST /upload without file returns 400", async () => {
    const res = await fetch(`${baseUrl}/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, "No file uploaded. Use form field name 'file'.");
  });

  test("POST /upload with session_id but no session_secret is rejected before forwarding", async () => {
    const originalPost = axios.post;
    const originalPostForm = axios.postForm;
    let validationCalled = false;
    let forwarded = false;

    axios.post = async () => {
      validationCalled = true;
      return { data: { allowed: true } };
    };
    axios.postForm = async () => {
      forwarded = true;
      return { data: {} };
    };

    try {
      const res = await fetch(`${baseUrl}/upload`, {
        method: "POST",
        body: createPdfUploadBody({
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
        }),
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.error, "session_secret is required to extend an existing session.");
      assert.equal(validationCalled, false);
      assert.equal(forwarded, false);
    } finally {
      axios.post = originalPost;
      axios.postForm = originalPostForm;
    }
  });

  test("POST /upload forwards session_secret when extending a session", async () => {
    const originalPost = axios.post;
    const originalPostForm = axios.postForm;
    let validatedBody = null;
    let forwardedFormData = null;

    axios.post = async (url, body) => {
      validatedBody = { url, body };
      return { data: { allowed: true } };
    };
    axios.postForm = async (url, formData) => {
      await consumeUploadStream(formData);
      forwardedFormData = { url, formData };
      return {
        data: {
          session_id: "550e8400-e29b-41d4-a716-446655440000",
          session_secret: "session-secret-123",
          document: { filename: "sample.pdf" },
          documents: [],
        },
      };
    };

    try {
      const res = await fetch(`${baseUrl}/upload`, {
        method: "POST",
        body: createPdfUploadBody({
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
          sessionSecret: "session-secret-123",
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.session_secret, "session-secret-123");
      assert.equal(validatedBody.url.endsWith("/validate-session-write"), true);
      assert.equal(validatedBody.body.session_id, "550e8400-e29b-41d4-a716-446655440000");
      assert.equal(validatedBody.body.session_secret, "session-secret-123");
      assert.equal(forwardedFormData.formData.session_id, "550e8400-e29b-41d4-a716-446655440000");
      assert.equal(forwardedFormData.formData.session_secret, "session-secret-123");
    } finally {
      axios.post = originalPost;
      axios.postForm = originalPostForm;
    }
  });

  test("GET unknown route returns 404", async () => {
    const res = await fetch(`${baseUrl}/nonexistent`, {
      method: "GET",
    });
    assert.equal(res.status, 404);
  });

  test("GET /health returns 200 and status ok", async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.deepEqual(data, { status: "ok" });
  });

  // ── Issue #263: unauthenticated static file serving ───────────────────────
  //
  // The /uploads directory must NOT be mounted as a static file server.
  // Any caller who learns a UUID filename (e.g. from the upload response or
  // from sessionStorage via XSS) must not be able to download the raw PDF
  // without supplying a valid session_secret. These tests confirm that the
  // express.static middleware is absent and that all /uploads/* paths 404.

  test("GET /uploads/any-file.pdf returns 404 — static serving is disabled", async () => {
    const res = await fetch(`${baseUrl}/uploads/some-uuid.pdf`);
    assert.equal(
      res.status,
      404,
      "Static PDF serving must be disabled; /uploads/* must return 404",
    );
  });

  test("GET /uploads/ index returns 404 — directory listing is disabled", async () => {
    const res = await fetch(`${baseUrl}/uploads/`);
    assert.equal(res.status, 404, "/uploads/ directory listing must not be served");
  });

  test("GET /uploads/<uuid>.pdf with query params returns 404 — no auth bypass", async () => {
    const res = await fetch(
      `${baseUrl}/uploads/550e8400-e29b-41d4-a716-446655440000.pdf?session_id=x&session_secret=y`,
    );
    assert.equal(
      res.status,
      404,
      "Query params must not unlock static file serving",
    );
  });

  test("successful upload response does not include a url field", async () => {
    const originalPostForm = axios.postForm;
    const originalPost = axios.post;

    axios.post = async () => ({ data: { allowed: true } });
    axios.postForm = async (url, formData) => {
      await consumeUploadStream(formData);
      return {
        data: {
          session_id: "550e8400-e29b-41d4-a716-446655440000",
          session_secret: "test-secret-abc",
          document: { document_id: "doc-123", filename: "sample.pdf" },
          documents: [],
        },
      };
    };

    try {
      const res = await fetch(`${baseUrl}/upload`, {
        method: "POST",
        body: createPdfUploadBody(),
      });

      assert.equal(res.status, 200);
      const data = await res.json();

      assert.equal(
        Object.prototype.hasOwnProperty.call(data, "url"),
        false,
        "Upload response must not include a 'url' field — files are deleted after indexing",
      );
      assert.equal(data.session_id, "550e8400-e29b-41d4-a716-446655440000");
      assert.equal(data.session_secret, "test-secret-abc");
      assert.ok(data.document, "Upload response must include document metadata");
    } finally {
      axios.postForm = originalPostForm;
      axios.post = originalPost;
    }
  });

  test("successful upload response shape is stable and complete", async () => {
    const originalPostForm = axios.postForm;

    axios.postForm = async (url, formData) => {
      await consumeUploadStream(formData);
      return {
        data: {
          session_id: "aaaabbbb-cccc-1234-dddd-eeeeeeeeeeee",
          session_secret: "super-secret-value",
          document: {
            document_id: "doc-abc",
            filename: "report.pdf",
            chunk_count: 42,
            uploaded_at: 1700000000,
          },
          documents: [
            { document_id: "doc-abc", filename: "report.pdf" },
          ],
        },
      };
    };

    try {
      const res = await fetch(`${baseUrl}/upload`, {
        method: "POST",
        body: createPdfUploadBody(),
      });

      assert.equal(res.status, 200);
      const data = await res.json();

      assert.equal(data.message, "PDF uploaded & processed successfully!");
      assert.equal(data.session_id, "aaaabbbb-cccc-1234-dddd-eeeeeeeeeeee");
      assert.equal(data.session_secret, "super-secret-value");
      assert.equal(data.document.filename, "report.pdf");
      assert.ok(Array.isArray(data.documents));
      // Confirm url is absent — files are never kept on server after indexing
      assert.equal(
        Object.prototype.hasOwnProperty.call(data, "url"),
        false,
        "url field must be absent from upload response",
      );
    } finally {
      axios.postForm = originalPostForm;
    }
  });

  test("POST /upload with non-PDF MIME type returns 415", async () => {
    const formData = new FormData();
    formData.append(
      "file",
      new Blob(["<html><body>not a pdf</body></html>"], { type: "text/html" }),
      "evil.pdf",
    );

    const res = await fetch(`${baseUrl}/upload`, {
      method: "POST",
      body: formData,
    });
    assert.equal(res.status, 415, "Non-PDF MIME types should return 415 Unsupported Media Type");
  });

  test("POST /upload with only session_secret (no session_id) returns 403", async () => {
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([Buffer.from("%PDF-1.4\n%%EOF")], { type: "application/pdf" }),
      "test.pdf",
    );
    formData.append("session_secret", "orphan-secret");

    const res = await fetch(`${baseUrl}/upload`, {
      method: "POST",
      body: formData,
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.ok(
      data.error.includes("session_id and session_secret must be provided together"),
      `Unexpected error message: ${data.error}`,
    );
  });

  test("POST /api/auth/signup normalizes email case and prevents duplicates", async () => {
    const timestamp = Date.now();
    const upperCaseEmail = ` TestUser-${timestamp}@Example.com `;
    const password = "ValidPassword123!";

    const res1 = await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: upperCaseEmail, password }),
    });
    assert.equal(res1.status, 201);
    
    const res2 = await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: upperCaseEmail.toLowerCase().trim(), password }),
    });
    assert.equal(res2.status, 400);
    const data = await res2.json();
    assert.equal(data.message, "User already exists");
  });

  test("POST /api/auth/login allows mixed-case and whitespace in email", async () => {
    const timestamp = Date.now();
    const upperCaseEmail = `TestUser2-${timestamp}@Example.com`;
    const password = "ValidPassword123!";

    await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: upperCaseEmail, password }),
    });

    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ` testuser2-${timestamp}@example.com `, password }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.token);
  });
});

// ── Issue #265: security integration tests ────────────────────────────────────

describe("question length validation", () => {
  let server;
  let baseUrl;

  before(() =>
    new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    }),
  );

  after(() => { if (server) server.close(); });

  test("POST /ask rejects question exceeding MAX_QUESTION_LENGTH with 400", async () => {
    const { MAX_QUESTION_LENGTH } = require("./validators/schemas");
    const oversized = "a".repeat(MAX_QUESTION_LENGTH + 1);
    const res = await fetch(`${baseUrl}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: oversized,
        session_id: "550e8400-e29b-41d4-a716-446655440000",
        session_secret: "test-secret",
      }),
    });
    assert.equal(res.status, 400, "Oversized question must be rejected with 400");
    const data = await res.json();
    assert.equal(data.error, "Validation failed");
    assert.ok(
      data.details.fieldErrors.question[0].includes("2000"),
      `Error message should mention the limit; got: ${data.details.fieldErrors.question[0]}`,
    );
  });

  test("POST /ask accepts question exactly at MAX_QUESTION_LENGTH", async () => {
    const { MAX_QUESTION_LENGTH } = require("./validators/schemas");
    const atLimit = "a".repeat(MAX_QUESTION_LENGTH);

    const originalPostForm = axios.postForm;
    const originalPost = axios.post;

    // Prevent the request reaching the real RAG service — we only want to
    // confirm schema validation passes (i.e. we get a non-400 status).
    axios.post = async () => ({
      data: { answer: "ok", sources: [] },
    });

    try {
      const res = await fetch(`${baseUrl}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: atLimit,
          session_id: "550e8400-e29b-41d4-a716-446655440000",
          session_secret: "test-secret",
        }),
      });
      // If the RAG mock doesn't fire (e.g. axios.post is overridden but the
      // handler uses axios.post differently) we might get a 502 — that still
      // proves schema validation passed (not 400).
      assert.notEqual(
        res.status,
        400,
        "Question at exactly MAX_QUESTION_LENGTH must pass schema validation",
      );
    } finally {
      axios.postForm = originalPostForm;
      axios.post = originalPost;
    }
  });
});

describe("IP ban system", () => {
  test("recordOffence first offence sets 5-minute ban", () => {
    const testIp = "192.0.2.1";
    bannedIPs.delete(testIp);
    const before = Date.now();
    recordOffence(testIp);
    const after = Date.now();
    const ban = bannedIPs.get(testIp);
    assert.ok(ban, "Ban entry must exist after first offence");
    assert.equal(ban.offences, 1, "offences counter must be 1");
    const expectedMin = before + BAN_DURATIONS_MS[0] - 50;
    const expectedMax = after + BAN_DURATIONS_MS[0] + 50;
    assert.ok(
      ban.until >= expectedMin && ban.until <= expectedMax,
      `Ban expiry must be ~${BAN_DURATIONS_MS[0] / 60000} minutes from now`,
    );
    bannedIPs.delete(testIp);
  });

  test("recordOffence second offence escalates to 15-minute ban", () => {
    const testIp = "192.0.2.2";
    bannedIPs.delete(testIp);
    recordOffence(testIp);
    recordOffence(testIp);
    const ban = bannedIPs.get(testIp);
    assert.equal(ban.offences, 2);
    const elapsed = ban.until - Date.now();
    assert.ok(
      elapsed > BAN_DURATIONS_MS[0],
      "Second offence ban must be longer than first offence ban",
    );
    bannedIPs.delete(testIp);
  });

  test("recordOffence third and subsequent offences cap at 1-hour ban", () => {
    const testIp = "192.0.2.3";
    bannedIPs.delete(testIp);
    recordOffence(testIp);
    recordOffence(testIp);
    recordOffence(testIp);
    recordOffence(testIp); // 4th offence — must not exceed 1-hour cap
    const ban = bannedIPs.get(testIp);
    assert.equal(ban.offences, 4);
    const maxDuration = BAN_DURATIONS_MS[BAN_DURATIONS_MS.length - 1];
    const elapsed = ban.until - Date.now();
    assert.ok(
      elapsed <= maxDuration + 50,
      "Ban duration must be capped at the maximum BAN_DURATIONS_MS value",
    );
    bannedIPs.delete(testIp);
  });

  test("banned IP receives 429 with Retry-After header", async () => {
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const base = `http://127.0.0.1:${server.address().port}`;

    const testIp = "192.0.2.10";
    bannedIPs.delete(testIp);
    // Plant a ban that expires far in the future.
    bannedIPs.set(testIp, { until: Date.now() + 5 * 60 * 1000, offences: 1 });

    try {
      // The test server receives requests from 127.0.0.1 (loopback). Directly
      // manipulate bannedIPs and use X-Forwarded-For to simulate a banned IP.
      // Since trust proxy is not configured in tests, we hit the loopback path.
      // Instead, directly assert that banGuard blocks an IP that IS in bannedIPs
      // by temporarily inserting the loopback address.
      bannedIPs.set("127.0.0.1", { until: Date.now() + 5 * 60 * 1000, offences: 1 });
      const res = await fetch(`${base}/health`);
      assert.equal(res.status, 429, "Banned IP must receive 429");
      assert.ok(
        res.headers.get("retry-after"),
        "429 response must include Retry-After header",
      );
      const data = await res.json();
      assert.ok(
        data.error.includes("banned"),
        "Error message must mention ban",
      );
    } finally {
      bannedIPs.delete("127.0.0.1");
      bannedIPs.delete(testIp);
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test("BAN_DURATIONS_MS has three tiers in ascending order", () => {
    assert.equal(BAN_DURATIONS_MS.length, 3, "Must have exactly 3 ban tiers");
    assert.ok(
      BAN_DURATIONS_MS[0] < BAN_DURATIONS_MS[1],
      "Tier 1 must be shorter than tier 2",
    );
    assert.ok(
      BAN_DURATIONS_MS[1] < BAN_DURATIONS_MS[2],
      "Tier 2 must be shorter than tier 3",
    );
  });
});

describe("askSchema question length boundary", () => {
  test("askSchema rejects question longer than MAX_QUESTION_LENGTH", () => {
    const { MAX_QUESTION_LENGTH } = require("./validators/schemas");
    const result = askSchema.safeParse({
      question: "x".repeat(MAX_QUESTION_LENGTH + 1),
      session_id: "550e8400-e29b-41d4-a716-446655440000",
      session_secret: "secret",
    });
    assert.equal(result.success, false);
    const msgs = result.error.issues.map((i) => i.message);
    assert.ok(
      msgs.some((m) => m.includes("2000")),
      `Expected a message mentioning 2000 chars, got: ${JSON.stringify(msgs)}`,
    );
  });

  test("askSchema accepts question exactly at MAX_QUESTION_LENGTH", () => {
    const { MAX_QUESTION_LENGTH } = require("./validators/schemas");
    const result = askSchema.safeParse({
      question: "y".repeat(MAX_QUESTION_LENGTH),
      session_id: "550e8400-e29b-41d4-a716-446655440000",
      session_secret: "secret",
    });
    assert.equal(result.success, true);
  });
});
