const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const axios = require("axios");

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

// Module-load test: would throw at require time if any undefined
// variable (e.g. fsSync) or broken import exists
let app, askSchema, summarizeSchema;
test("module loads without error", () => {
  const mod = require("./server.js");
  app = mod.app;
  askSchema = mod.askSchema;
  summarizeSchema = mod.summarizeSchema;

  assert.ok(typeof app === "function", "app should be an Express app");
  assert.ok(typeof askSchema.safeParse === "function", "askSchema should be a Zod schema");
  assert.ok(typeof summarizeSchema.safeParse === "function", "summarizeSchema should be a Zod schema");
});

describe("askSchema validation", () => {
  test("accepts valid input", () => {
    const result = askSchema.safeParse({
      question: "What is this PDF about?",
      session_id: "550e8400-e29b-41d4-a716-446655440000",
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

  test("POST /upload with session_id but no session_secret returns 403", async () => {
    const originalPostForm = axios.postForm;
    let forwarded = false;

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
      assert.equal(
        data.error,
        "session_id and session_secret must be provided together to extend an existing session.",
      );
      assert.equal(forwarded, false);
    } finally {
      axios.postForm = originalPostForm;
    }
  });

  test("GET unknown route returns 404", async () => {
    const res = await fetch(`${baseUrl}/nonexistent`, {
      method: "GET",
    });
    assert.equal(res.status, 404);
  });
});
