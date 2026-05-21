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
const questionSchema = z.preprocess(
  (val) => (typeof val === "string" ? val : ""),
  z.string().trim().min(1, "Question is required."),
);

const askSchema = z.object({
  question: questionSchema,
  session_id: uuidSchema,
});

const summarizeSchema = z.object({
  session_id: uuidSchema,
});

module.exports = {
  askSchema,
  summarizeSchema,
};
