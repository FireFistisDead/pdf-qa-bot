const { z } = require("zod");

const uuidSchema = z.string().uuid("Invalid session ID format.");

const askSchema = z.object({
  question: z.string().trim().min(1, "Question is required."),
  session_id: uuidSchema,
});

const summarizeSchema = z.object({
  session_id: uuidSchema,
});

module.exports = {
  askSchema,
  summarizeSchema,
};
