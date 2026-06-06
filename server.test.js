const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { spawnSync } = require("node:child_process");
const axios = require("axios");
const { Blob } = require("node:buffer");
const jwt = require("jsonwebtoken");

const originalInternalRagToken = process.env.INTERNAL_RAG_TOKEN;
const originalJwtSecret = process.env.JWT_SECRET;
const originalSupabaseJwtSecret = process.env.SUPABASE_JWT_SECRET;

before(() => {
  process.env.INTERNAL_RAG_TOKEN = process.env.INTERNAL_RAG_TOKEN || "test-internal-rag-token";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
  process.env.SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || "test-supabase-jwt-secret";
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

  if (originalSupabaseJwtSecret === undefined) {
    delete process.env.SUPABASE_JWT_SECRET;
  } else {
    process.env.SUPABASE_JWT_SECRET = originalSupabaseJwtSecret;
  }
});

// Module-load test: would throw at require time if any undefined
// variable (e.g. fsSync) or broken import exists
let app, askSchema, summarizeSchema, extractServiceDetails, ragAuthHeaders;
let _credCache, _credKey, _credCacheHit, _credCacheStore, _credCacheDrop;
let validateAskBody, validateSummarizeBody, MAX_QUESTION_LENGTH;
let clientIpFromRequest, normalizeIp;
before(() => {
  process.env.JWT_SECRET = "test-secret-for-ci";
  const mod = require("./server.js");
  app = mod.app;
  askSchema = mod.askSchema;
  summarizeSchema = mod.summarizeSchema;
  extractServiceDetails = mod.extractServiceDetails;
  _credCache = mod._credCache;
  _credKey = mod._credKey;
  _credCacheHit = mod._credCacheHit;
  _credCacheStore = mod._credCacheStore;
  _credCacheDrop = mod._credCacheDrop;
  validateAskBody = mod.validateAskBody;
  validateSummarizeBody = mod.validateSummarizeBody;
  MAX_QUESTION_LENGTH = mod.MAX_QUESTION_LENGTH;
  ragAuthHeaders = mod.ragAuthHeaders;

  ({ clientIpFromRequest, normalizeIp } = require("./security/ip"));
});

test("module loads without error", () => {
  assert.ok(typeof app === "function", "app should be an Express app");
  assert.ok(typeof askSchema.safeParse === "function", "askSchema should be a Zod schema");
  assert.ok(typeof summarizeSchema.safeParse === "function", "summarizeSchema should be a Zod schema");
  assert.ok(typeof extractServiceDetails === "function", "extractServiceDetails should be exported for tests");
  assert.ok(typeof validateAskBody === "function", "validateAskBody should be exported");
  assert.ok(typeof validateSummarizeBody === "function", "validateSummarizeBody should be exported");
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

test("server startup fails when SUPABASE_JWT_SECRET is unset", () => {
  const result = spawnSync(
    process.execPath,
    ["server.js"],
    {
      cwd: __dirname,
      env: {
        ...process.env,
        SUPABASE_JWT_SECRET: "",
        JWT_SECRET: "test-jwt-secret",
        INTERNAL_RAG_TOKEN: "test-internal-rag-token",
      },
      encoding: "utf8",
      timeout: 5000,
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}${result.stdout}`, /SUPABASE_JWT_SECRET missing/);
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

const runIsolatedGatewayScript = (script, extraEnv = {}) => {
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: __dirname,
    env: {
      ...process.env,
      INTERNAL_RAG_TOKEN: "test-internal-rag-token",
      JWT_SECRET: "test-jwt-secret",
      ...extraEnv,
    },
    encoding: "utf8",
    timeout: 20000,
  });

  assert.equal(
    result.status,
    0,
    `Isolated gateway script failed:\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
  );

  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  assert.ok(lines.length > 0, "Expected JSON output from isolated gateway script");
  return JSON.parse(lines.at(-1));
};

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

  test("POST /ask/stream forwards internal auth header", async () => {
    const originalPost = axios.post;
    let forwardedHeaders = null;

    axios.post = async (url, body, options) => {
      forwardedHeaders = options?.headers;
      const { PassThrough } = require("node:stream");
      const fakeStream = new PassThrough();
      fakeStream.end("mock streamed answer");
      return { data: fakeStream };
    };

    try {
      const res = await fetch(`${baseUrl}/ask/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: "hi",
          session_id: "550e8400-e29b-41d4-a716-446655440000",
          session_secret: "secret-abc",
        }),
      });
      assert.equal(res.status, 200);
      assert.equal(forwardedHeaders["X-Internal-Token"], process.env.INTERNAL_RAG_TOKEN);
    } finally {
      axios.post = originalPost;
    }
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

  test("POST /ask returns 429 JSON when the gateway rate limit is exceeded", () => {
    const result = runIsolatedGatewayScript(`
      const http = require("node:http");
      const axios = require("axios");
      const { app } = require("./server.js");

      axios.post = async () => ({
        data: {
          answer: "ok",
          sources: [],
          mode: "default",
        },
      });

      const server = http.createServer(app);
      server.listen(0, async () => {
        const { port } = server.address();
        const baseUrl = "http://127.0.0.1:" + port;
        const body = JSON.stringify({
          question: "What is this PDF about?",
          session_id: "550e8400-e29b-41d4-a716-446655440000",
          session_secret: "session-secret-123",
        });

        const first = await fetch(baseUrl + "/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });

        const second = await fetch(baseUrl + "/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });

        const firstJson = await first.json();
        const secondJson = await second.json();

        console.log(JSON.stringify({
          firstStatus: first.status,
          firstJson,
          secondStatus: second.status,
          secondJson,
        }));

        await new Promise((resolve) => server.close(resolve));
      });
    `, {
      RATE_LIMIT_MAX: "1",
      RATE_LIMIT_WINDOW_MS: "60000",
    });

    assert.equal(result.firstStatus, 200);
    assert.equal(result.secondStatus, 429);
    assert.match(result.secondJson.error, /too many requests/i);
  });

  test("POST /upload returns 429 JSON when concurrent uploads exceed the cap", () => {
    const result = runIsolatedGatewayScript(`
      const http = require("node:http");
      const axios = require("axios");
      const { app } = require("./server.js");

      let releaseFirstUpload;
      const holdFirstUpload = new Promise((resolve) => {
        releaseFirstUpload = resolve;
      });

      let firstPostFormReached;
      const firstPostFormReachedPromise = new Promise((resolve) => {
        firstPostFormReached = resolve;
      });

      let postFormCalls = 0;
      axios.postForm = async () => {
        postFormCalls += 1;
        if (postFormCalls === 1) {
          firstPostFormReached();
          await holdFirstUpload;
        }

        return {
          data: {
            session_id: "550e8400-e29b-41d4-a716-446655440000",
            session_secret: "session-secret-123",
            document: { filename: "sample.pdf" },
            documents: [],
          },
        };
      };

      const server = http.createServer(app);
      server.listen(0, async () => {
        const { port } = server.address();
        const baseUrl = "http://127.0.0.1:" + port;

        const firstRequest = fetch(baseUrl + "/upload", {
          method: "POST",
          body: (() => {
            const formData = new FormData();
            formData.append(
              "file",
              new Blob([Buffer.from("%PDF-1.4\\n%%EOF")], { type: "application/pdf" }),
              "sample.pdf",
            );
            return formData;
          })(),
        });

        await firstPostFormReachedPromise;

        const second = await fetch(baseUrl + "/upload", {
          method: "POST",
          body: (() => {
            const formData = new FormData();
            formData.append(
              "file",
              new Blob([Buffer.from("%PDF-1.4\\n%%EOF")], { type: "application/pdf" }),
              "sample.pdf",
            );
            return formData;
          })(),
        });

        const secondJson = await second.json();
        releaseFirstUpload();

        const first = await firstRequest;
        const firstJson = await first.json();

        console.log(JSON.stringify({
          firstStatus: first.status,
          firstJson,
          secondStatus: second.status,
          secondJson,
        }));

        await new Promise((resolve) => server.close(resolve));
      });
    `, {
      RATE_LIMIT_MAX: "60",
      RATE_LIMIT_WINDOW_MS: "60000",
      UPLOAD_MAX_CONCURRENT_PER_IP: "1",
      UPLOAD_MAX_FILE_SIZE_BYTES: "20000000",
    });

    assert.equal(result.firstStatus, 200);
    assert.equal(result.secondStatus, 429);
    assert.match(result.secondJson.error, /too many concurrent uploads/i);
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

// ─── Credential validation cache tests ───────────────────────────────────────

const _V_UUID = "550e8400-e29b-41d4-a716-446655440000";
const _V_SECRET = "any-valid-session-secret";

describe("credential validation cache", () => {
  test("cache miss returns false for unseen credentials", () => {
    assert.equal(_credCacheHit(_V_UUID, "never-seen"), false);
  });

  test("cache hit returns true after store", () => {
    _credCacheStore(_V_UUID, _V_SECRET);
    assert.equal(_credCacheHit(_V_UUID, _V_SECRET), true);
    _credCacheDrop(_V_UUID, _V_SECRET);
  });

  test("drop removes cached entry", () => {
    _credCacheStore(_V_UUID, "drop-me");
    _credCacheDrop(_V_UUID, "drop-me");
    assert.equal(_credCacheHit(_V_UUID, "drop-me"), false);
  });

  test("different secrets produce different cache keys", () => {
    assert.notEqual(_credKey(_V_UUID, "a"), _credKey(_V_UUID, "b"));
  });

  test("different session_ids produce different cache keys", () => {
    assert.notEqual(
      _credKey("550e8400-e29b-41d4-a716-446655440000", _V_SECRET),
      _credKey("660e8400-e29b-41d4-a716-446655440000", _V_SECRET),
    );
  });

  test("FIFO eviction at max size", () => {
    _credCacheStore("aaa", "aaa");
    assert.equal(_credCacheHit("aaa", "aaa"), true);
    for (let i = 0; i < 1001; i++) {
      _credCacheStore(`fill-${i}`, `sec-${i}`);
    }
    assert.equal(_credCacheHit("aaa", "aaa"), false, "oldest entry must be evicted");
  });

  test("validateAskBody accepts valid input and populates cache", () => {
    _credCacheDrop(_V_UUID, _V_SECRET);
    const result = validateAskBody({
      question: "What is this document about?",
      session_id: _V_UUID,
      session_secret: _V_SECRET,
    });
    assert.equal(result.success, true);
    assert.ok(result.data.question);
    assert.equal(_credCacheHit(_V_UUID, _V_SECRET), true);
    _credCacheDrop(_V_UUID, _V_SECRET);
  });

  test("validateAskBody uses cache on second identical-credential call", () => {
    _credCacheDrop(_V_UUID, _V_SECRET);
    validateAskBody({ question: "First?", session_id: _V_UUID, session_secret: _V_SECRET });
    const result = validateAskBody({
      question: "Second question here?",
      session_id: _V_UUID,
      session_secret: _V_SECRET,
    });
    assert.equal(result.success, true);
    assert.equal(result.data.question, "Second question here?");
    _credCacheDrop(_V_UUID, _V_SECRET);
  });

  test("validateAskBody rejects invalid session_id even on first call", () => {
    const result = validateAskBody({
      question: "Valid question?",
      session_id: "not-a-uuid",
      session_secret: _V_SECRET,
    });
    assert.equal(result.success, false);
  });

  test("validateAskBody rejects empty question even when credentials are cached", () => {
    _credCacheStore(_V_UUID, _V_SECRET);
    const result = validateAskBody({
      question: "",
      session_id: _V_UUID,
      session_secret: _V_SECRET,
    });
    assert.equal(result.success, false, "Empty question must fail even on cache hit");
    _credCacheDrop(_V_UUID, _V_SECRET);
  });

  test("validateAskBody rejects question over MAX_QUESTION_LENGTH", () => {
    const result = validateAskBody({
      question: "q".repeat(MAX_QUESTION_LENGTH + 1),
      session_id: _V_UUID,
      session_secret: _V_SECRET,
    });
    assert.equal(result.success, false);
  });

  test("validateSummarizeBody accepts valid input and caches", () => {
    _credCacheDrop(_V_UUID, "sum-secret");
    const result = validateSummarizeBody({ session_id: _V_UUID, session_secret: "sum-secret" });
    assert.equal(result.success, true);
    assert.equal(_credCacheHit(_V_UUID, "sum-secret"), true);
    _credCacheDrop(_V_UUID, "sum-secret");
  });

  test("validateSummarizeBody uses cache on second call", () => {
    _credCacheDrop(_V_UUID, "sum2");
    validateSummarizeBody({ session_id: _V_UUID, session_secret: "sum2" });
    const result = validateSummarizeBody({ session_id: _V_UUID, session_secret: "sum2" });
    assert.equal(result.success, true);
    _credCacheDrop(_V_UUID, "sum2");
  });

  test("validateSummarizeBody rejects missing session_id", () => {
    const result = validateSummarizeBody({ session_secret: "some-secret" });
    assert.equal(result.success, false);
  });
});

describe("requireSupabaseAuth", () => {
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

  test("rejects missing Authorization header", async () => {
    const res = await fetch(`${baseUrl}/process-from-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/test.pdf" }),
    });
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.error, "Missing or invalid authorization token");
  });

  test("rejects malformed token", async () => {
    const res = await fetch(`${baseUrl}/process-from-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer invalid.jwt.token",
      },
      body: JSON.stringify({ url: "https://example.com/test.pdf" }),
    });
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.error, "Invalid token");
  });

  test("rejects token signed with wrong secret", async () => {
    const token = jwt.sign({ role: "authenticated" }, "wrong-secret");
    const res = await fetch(`${baseUrl}/process-from-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ url: "https://example.com/test.pdf" }),
    });
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.error, "Invalid token");
  });

  test("accepts valid token and proceeds to route handler", async () => {
    const token = jwt.sign({ role: "authenticated" }, process.env.SUPABASE_JWT_SECRET);
    const res = await fetch(`${baseUrl}/process-from-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ url: "https://example.com/test.pdf" }),
    });
    assert.notEqual(res.status, 401, "Valid token should not be rejected");
  });
});
