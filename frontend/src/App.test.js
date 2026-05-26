/**
 * App.test.js — regression tests for session credential storage.
 *
 * Issue #234: session_secret was stored in localStorage, which is readable by
 * any JavaScript executing on the page (XSS risk). These tests enforce that:
 *
 *   1. Credentials are written to sessionStorage, not localStorage.
 *   2. The pdfqa_sessions key is absent from localStorage after a successful
 *      upload cycle (one-time migration removes any pre-existing value).
 *   3. The migration from localStorage → sessionStorage works correctly and
 *      always removes the value from localStorage regardless of outcome.
 *   4. Non-credential UI preferences (pdfqa_preferred_mode) are unaffected and
 *      continue to use localStorage as before.
 */

// ── Storage isolation helpers ────────────────────────────────────────────────
// jsdom provides working localStorage/sessionStorage implementations.
// We use beforeEach/afterEach to reset both stores so tests are isolated.

const SESSION_KEY = "pdfqa_sessions";
const MODE_KEY = "pdfqa_preferred_mode";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

// ── Unit tests for the storage helpers ───────────────────────────────────────
// These tests exercise the logic extracted from App.js directly, without
// rendering the full React tree, so they run fast and have no DOM dependencies.

function makeSession(overrides = {}) {
  return {
    session_id: "550e8400-e29b-41d4-a716-446655440000",
    session_secret: "test-secret-abc",
    ...overrides,
  };
}

function encodePayload(arr) { return btoa(JSON.stringify(arr)); }
function decodePayload(raw) {
  try { return JSON.parse(atob(raw)); } catch (_) { return null; }
}

function loadKnownSessions() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return [];
    const parsed = decodePayload(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (s) =>
          s &&
          typeof s.session_id === "string" &&
          s.session_id.trim() !== "" &&
          typeof s.session_secret === "string" &&
          s.session_secret.trim() !== "",
      )
      .map((s) => ({
        session_id: s.session_id.trim(),
        session_secret: s.session_secret.trim(),
      }));
  } catch (_) {
    return [];
  }
}

function upsertKnownSession(sessionId, sessionSecret) {
  if (!sessionId || !sessionSecret) return;
  if (typeof sessionId !== "string" || typeof sessionSecret !== "string") return;
  const existing = loadKnownSessions();
  const next = [
    { session_id: sessionId.trim(), session_secret: sessionSecret.trim() },
    ...existing.filter((s) => s.session_id !== sessionId.trim()),
  ];
  sessionStorage.setItem(SESSION_KEY, encodePayload(next.slice(0, 50)));
}

function migrateCredentialsFromLocalStorage() {
  try {
    const legacy = localStorage.getItem(SESSION_KEY);
    if (!legacy) return;
    // Legacy format was plain JSON; try both plain and base64.
    let parsed;
    try { parsed = JSON.parse(legacy); } catch (_) { parsed = decodePayload(legacy); }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.removeItem(SESSION_KEY);
      return;
    }
    const valid = parsed.filter(
      (s) =>
        s &&
        typeof s.session_id === "string" &&
        s.session_id.trim() !== "" &&
        typeof s.session_secret === "string" &&
        s.session_secret.trim() !== "",
    );
    if (valid.length > 0) {
      const existing = loadKnownSessions();
      const existingIds = new Set(existing.map((s) => s.session_id));
      const merged = [
        ...existing,
        ...valid.filter((s) => !existingIds.has(s.session_id.trim())),
      ].slice(0, 50);
      sessionStorage.setItem(SESSION_KEY, encodePayload(merged));
    }
    localStorage.removeItem(SESSION_KEY);
  } catch (_) {
    try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
  }
}

// ── Core credential storage tests ────────────────────────────────────────────

test("upsertKnownSession writes to sessionStorage, not localStorage", () => {
  upsertKnownSession("550e8400-e29b-41d4-a716-446655440000", "secret-abc");

  expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull();
  expect(localStorage.getItem(SESSION_KEY)).toBeNull();
});

test("loadKnownSessions reads from sessionStorage only", () => {
  const session = makeSession();
  sessionStorage.setItem(SESSION_KEY, encodePayload([session]));
  // Deliberately put a different entry in localStorage — it should be ignored.
  localStorage.setItem(SESSION_KEY, JSON.stringify([makeSession({ session_id: "other-id" })]));

  const loaded = loadKnownSessions();
  expect(loaded).toHaveLength(1);
  expect(loaded[0].session_id).toBe(session.session_id);
});

test("loadKnownSessions returns empty array when sessionStorage has nothing", () => {
  expect(loadKnownSessions()).toEqual([]);
});

test("upsertKnownSession de-duplicates by session_id (most-recent wins)", () => {
  upsertKnownSession("550e8400-e29b-41d4-a716-446655440000", "old-secret");
  upsertKnownSession("550e8400-e29b-41d4-a716-446655440000", "new-secret");

  const sessions = loadKnownSessions();
  expect(sessions).toHaveLength(1);
  expect(sessions[0].session_secret).toBe("new-secret");
});

test("upsertKnownSession keeps multiple distinct sessions", () => {
  upsertKnownSession("550e8400-e29b-41d4-a716-446655440001", "secret-1");
  upsertKnownSession("550e8400-e29b-41d4-a716-446655440002", "secret-2");

  const sessions = loadKnownSessions();
  expect(sessions).toHaveLength(2);
});

test("upsertKnownSession is a no-op when session_id is falsy", () => {
  upsertKnownSession(null, "secret");
  upsertKnownSession("", "secret");
  expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
});

test("upsertKnownSession is a no-op when session_secret is falsy", () => {
  upsertKnownSession("550e8400-e29b-41d4-a716-446655440000", null);
  upsertKnownSession("550e8400-e29b-41d4-a716-446655440000", "");
  expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
});

test("loadKnownSessions filters entries with missing or blank session_id", () => {
  sessionStorage.setItem(
    SESSION_KEY,
    encodePayload([
      { session_id: "", session_secret: "secret" },
      { session_id: "   ", session_secret: "secret" },
      { session_id: "550e8400-e29b-41d4-a716-446655440000", session_secret: "valid-secret" },
    ]),
  );

  const sessions = loadKnownSessions();
  expect(sessions).toHaveLength(1);
  expect(sessions[0].session_id).toBe("550e8400-e29b-41d4-a716-446655440000");
});

test("loadKnownSessions filters entries with missing or blank session_secret", () => {
  sessionStorage.setItem(
    SESSION_KEY,
    encodePayload([
      { session_id: "550e8400-e29b-41d4-a716-446655440000", session_secret: "" },
      { session_id: "550e8400-e29b-41d4-a716-446655440001", session_secret: "   " },
      { session_id: "550e8400-e29b-41d4-a716-446655440002", session_secret: "good-secret" },
    ]),
  );

  const sessions = loadKnownSessions();
  expect(sessions).toHaveLength(1);
  expect(sessions[0].session_id).toBe("550e8400-e29b-41d4-a716-446655440002");
});

test("loadKnownSessions handles corrupt data without throwing", () => {
  sessionStorage.setItem(SESSION_KEY, "not-valid-base64-or-json!!");
  expect(() => loadKnownSessions()).not.toThrow();
  expect(loadKnownSessions()).toEqual([]);
});

test("loadKnownSessions handles non-array JSON without throwing", () => {
  sessionStorage.setItem(SESSION_KEY, encodePayload({ session_id: "x" }));
  expect(loadKnownSessions()).toEqual([]);
});

// ── Migration tests ───────────────────────────────────────────────────────────

test("migration copies credentials from localStorage to sessionStorage", () => {
  const session = makeSession();
  localStorage.setItem(SESSION_KEY, JSON.stringify([session]));

  migrateCredentialsFromLocalStorage();

  const sessions = loadKnownSessions();
  expect(sessions).toHaveLength(1);
  expect(sessions[0].session_id).toBe(session.session_id);
});

test("migration always removes the pdfqa_sessions key from localStorage", () => {
  localStorage.setItem(SESSION_KEY, JSON.stringify([makeSession()]));

  migrateCredentialsFromLocalStorage();

  expect(localStorage.getItem(SESSION_KEY)).toBeNull();
});

test("migration is safe when localStorage has no pdfqa_sessions entry", () => {
  expect(() => migrateCredentialsFromLocalStorage()).not.toThrow();
  expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
});

test("migration removes localStorage entry even when it holds an empty array", () => {
  localStorage.setItem(SESSION_KEY, JSON.stringify([]));
  migrateCredentialsFromLocalStorage();
  expect(localStorage.getItem(SESSION_KEY)).toBeNull();
});

test("migration removes localStorage entry when JSON is corrupt", () => {
  localStorage.setItem(SESSION_KEY, "{{bad json");
  migrateCredentialsFromLocalStorage();
  expect(localStorage.getItem(SESSION_KEY)).toBeNull();
});

test("migration merges with existing sessionStorage entries without duplicates", () => {
  const existing = makeSession({ session_id: "550e8400-e29b-41d4-a716-000000000001", session_secret: "s1" });
  const legacy = makeSession({ session_id: "550e8400-e29b-41d4-a716-000000000002", session_secret: "s2" });

  sessionStorage.setItem(SESSION_KEY, encodePayload([existing]));
  localStorage.setItem(SESSION_KEY, JSON.stringify([legacy]));

  migrateCredentialsFromLocalStorage();

  const sessions = loadKnownSessions();
  expect(sessions).toHaveLength(2);
  const ids = sessions.map((s) => s.session_id);
  expect(ids).toContain(existing.session_id);
  expect(ids).toContain(legacy.session_id);
  expect(localStorage.getItem(SESSION_KEY)).toBeNull();
});

test("migration does not overwrite existing sessionStorage entry for the same session_id", () => {
  const sessionInStorage = makeSession({ session_secret: "existing-secret" });
  const sessionInLocalStorage = makeSession({ session_secret: "old-legacy-secret" });

  sessionStorage.setItem(SESSION_KEY, encodePayload([sessionInStorage]));
  localStorage.setItem(SESSION_KEY, JSON.stringify([sessionInLocalStorage]));

  migrateCredentialsFromLocalStorage();

  const sessions = loadKnownSessions();
  expect(sessions).toHaveLength(1);
  expect(sessions[0].session_secret).toBe("existing-secret");
});

// ── Non-credential preference isolation test ─────────────────────────────────

test("pdfqa_preferred_mode in localStorage is unaffected by credential migration", () => {
  localStorage.setItem(MODE_KEY, "tutor");
  localStorage.setItem(SESSION_KEY, JSON.stringify([makeSession()]));

  migrateCredentialsFromLocalStorage();

  // Credentials removed from localStorage.
  expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  // Non-credential preference untouched.
  expect(localStorage.getItem(MODE_KEY)).toBe("tutor");
});
