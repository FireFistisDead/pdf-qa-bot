const { z } = require("zod");
const util = require("util");

// ─── UUID schema ─────────────────────────────────────────────────────────────
const uuidSchema = z.preprocess(
  (val) => (typeof val === "string" ? val : ""),
  z.string().superRefine((val, ctx) => {
    if (!val) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "session_id is required." });
      return z.NEVER;
    }
    const UUID_PATTERN =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!UUID_PATTERN.test(val)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid session ID format." });
    }
  }),
);

// ─── Question schema ──────────────────────────────────────────────────────────
const MAX_QUESTION_LENGTH = 2000;
const questionSchema = z.preprocess(
  (val) => (typeof val === "string" ? val : ""),
  z.string().trim().min(1, "Question is required.").max(
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

// ─── Chat Message schema ─────────────────────────────────────────────────────
const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(1500),
});

// ─── Split schemas for credential vs payload validation ───────────────────────
const askCredentialSchema = z.object({
  session_id: uuidSchema,
  session_secret: sessionSecretSchema,
});

const askPayloadSchema = z
  .object({
    question: questionSchema,
    mode: modeSchema,
    chat_history: z.array(chatMessageSchema)
      .max(6, "chat_history may contain at most 6 messages.")
      .optional()
      .default([]),
  })
  .superRefine((val, ctx) => {
    try {
      const size = JSON.stringify(val).length;
      if (size > 16000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "request body exceeds 16kb transport limit",
        });
      }
    } catch (err) {
      console.warn(
        "schema stringify failed",
        err?.message || err,
        "type:", typeof val,
        "preview:", util.inspect(val, { depth: 1, maxArrayLength: 2 })
      );
    }
  });

// Combined schema — kept for backwards compatibility
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

const summarizeCredentialSchema = z.object({
  session_id: uuidSchema,
  session_secret: sessionSecretSchema,
});

const knowledgeGapsSchema = z.object({
  session_id: uuidSchema,
  session_secret: sessionSecretSchema,
  document_id: z.string().optional(),
});

const sessionsLookupSchema = z.object({
  sessions: z.array(
    z.object({
      session_id: uuidSchema,
      session_secret: sessionSecretSchema,
    }),
  ).min(1, "sessions is required."),
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
  chatMessageSchema,
};
