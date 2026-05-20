const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

// Module-load test: would throw at require time if any undefined
// variable (e.g. fsSync) or broken import exists
let app, validateAskBody, validateSummarizeBody;
test("module loads without error", () => {
  const mod = require("./server.js");
  app = mod.app;
  validateAskBody = mod.validateAskBody;
  validateSummarizeBody = mod.validateSummarizeBody;

  assert.ok(typeof app === "function", "app should be an Express app");
  assert.ok(typeof validateAskBody === "function", "validateAskBody should be a function");
  assert.ok(typeof validateSummarizeBody === "function", "validateSummarizeBody should be a function");
});

describe("validateAskBody validation", () => {
  test("accepts valid input", () => {
    const result = validateAskBody({
      question: "What is this PDF about?",
      session_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    assert.ok(result.value !== undefined, "Expected value to be populated");
    assert.strictEqual(result.error, undefined);
  });

  test("rejects empty question", () => {
    const result = validateAskBody({
      question: "",
      session_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    assert.strictEqual(result.error, "Question is required.");
  });

  test("rejects missing session_id", () => {
    const result = validateAskBody({
      question: "What is this PDF about?",
    });
    assert.strictEqual(result.error, "session_id is required.");
  });

  test("rejects non-UUID session_id", () => {
    const result = validateAskBody({
      question: "What is this PDF about?",
      session_id: "not-a-uuid",
    });
    assert.strictEqual(result.error, "Invalid session ID format.");
  });
});

describe("validateSummarizeBody validation", () => {
  test("accepts valid input", () => {
    const result = validateSummarizeBody({
      session_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    assert.ok(result.value !== undefined, "Expected value to be populated");
    assert.strictEqual(result.error, undefined);
  });

  test("rejects missing session_id", () => {
    const result = validateSummarizeBody({});
    assert.strictEqual(result.error, "session_id is required.");
  });

  test("rejects empty session_id", () => {
    const result = validateSummarizeBody({
      session_id: "",
    });
    assert.strictEqual(result.error, "session_id is required.");
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
    assert.equal(data.error, "Question is required.");
  });

  test("POST /ask with invalid session_id returns 400", async () => {
    const res = await fetch(`${baseUrl}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "hi", session_id: "bad" }),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, "Invalid session ID format.");
  });

  test("POST /summarize with empty body returns 400", async () => {
    const res = await fetch(`${baseUrl}/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, "session_id is required.");
  });

  test("POST /summarize with missing session_id returns 400", async () => {
    const res = await fetch(`${baseUrl}/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "" }),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, "session_id is required.");
  });

  test("POST /upload without file returns 400", async () => {
    const res = await fetch(`${baseUrl}/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, "No PDF uploaded. Please choose a PDF file and try again.");
  });

  test("GET unknown route returns 404", async () => {
    const res = await fetch(`${baseUrl}/nonexistent`, {
      method: "GET",
    });
    assert.equal(res.status, 404);
  });
});
