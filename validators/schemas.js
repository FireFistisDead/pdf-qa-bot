const { z } = require("zod");

// ─── UUID schema ─────────────────────────────────────────────────────────────
// Three distinct error states, one message each:
//   missing (undefined)  → "session_id is required."
//   empty string ("")    → "session_id is required."
//   non-UUID string      → "Invalid session ID format."
//
// Zod v4 changed how invalid_type_error is surfaced, so we use
// z.preprocess to convert non-string values → "" first, then validate as a
// non-empty string. superRefine stops after the first failing check so
// an empty string only ever produces one error, not two.
const uuidSchema = z.preprocess(
  (val) => (typeof val === "string" ? val : ""),
  z.string().superRefine((val, ctx) => {
    if (!val) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "session_id is required.",
      });
      return z.NEVER; // stop — don't run the UUID check on an empty string
    }
    const UUID_PATTERN =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!UUID_PATTERN.test(val)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid session ID format.",
      });
    }
  }),
);

// ─── Question schema ──────────────────────────────────────────────────────────
// Converts non-string values → "" so missing/invalid question input produces
// "Question is required." rather than Zod's generic invalid-type message.
// Trim surrounding whitespace so whitespace-only questions are treated as empty.
// Hard cap at 2000 characters to prevent prompt-injection via oversized questions
// and to bound LLM context consumption per request.
const MAX_QUESTION_LENGTH = 2000;

const questionSchema = z.preprocess(
  (val) => (typeof val === "string" ? val : ""),
  z
    .string()
    .trim()
    .min(1, "Question is required.")
    .max(
      MAX_QUESTION_LENGTH,
      `Question must not exceed ${MAX_QUESTION_LENGTH} characters.`,
    ),
);

const modeSchema = z.preprocess(
  (val) => (typeof val === "string" ? val : "default"),
  z.enum(["default", "tutor", "socratic", "eli5", "concise"]).default("default"),
);

const sessionSecretSchema = z.preprocess(
  (val) => (typeof val === "string" ? val : ""),
  z.string().trim().min(1, "session_secret is required."),
);

// ─── Split schemas for credential vs payload validation ───────────────────────
// Credential fields (session_id, session_secret) are structurally identical
// for every turn within a session. Separating them into a dedicated schema
// lets the gateway short-circuit structural re-validation on cache hit while
// always running question/mode validation, which changes per request.
const askCredentialSchema = z.object({
  session_id: uuidSchema,
  session_secret: sessionSecretSchema,
});

const askPayloadSchema = z.object({
  question: questionSchema,
  mode: modeSchema,
});

// Combined schema — kept for backwards compatibility with existing tests and
// any direct callers that pass the full request body to a single safeParse.
const askSchema = z.object({
  question: questionSchema,
  session_id: uuidSchema,
  session_secret: sessionSecretSchema,
  mode: modeSchema,
});

const summarizeSchema = z.object({
  session_id: uuidSchema,
  session_secret: sessionSecretSchema,
});

// Credential-only schema for /summarize — used by the gateway's cache so the
// UUID and secret checks are not repeated on every call.
const summarizeCredentialSchema = z.object({
  session_id: uuidSchema,
  session_secret: sessionSecretSchema,
});

// Knowledge gap mapping: same auth fields as summarize, plus an optional
// document_id that scopes analysis to the active document in a multi-doc session.
const knowledgeGapsSchema = z.object({
  session_id: uuidSchema,
  session_secret: sessionSecretSchema,
  document_id: z.string().optional(),
});

const sessionsLookupSchema = z.object({
  sessions: z
    .array(
      z.object({
        session_id: uuidSchema,
        session_secret: sessionSecretSchema,
      }),
    )
    .min(1, "sessions is required."),
});

const generateFlashcardsSchema = z.object({
  session_id: uuidSchema,
  session_secret: sessionSecretSchema,
  count: z.number().int().min(1).max(50).optional().default(10),
});

const updateFlashcardProgressSchema = z.object({
  session_id: uuidSchema,
  session_secret: sessionSecretSchema,
  card_id: z.string().trim().min(1, "card_id is required."),
  rating: z.enum(["again", "good", "easy"]),
});

module.exports = {
  askSchema,
  askCredentialSchema,
  askPayloadSchema,
  summarizeSchema,
  summarizeCredentialSchema,
  sessionsLookupSchema,
  MAX_QUESTION_LENGTH,
  knowledgeGapsSchema,
  generateFlashcardsSchema,
  updateFlashcardProgressSchema,
};
