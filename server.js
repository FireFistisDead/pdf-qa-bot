const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { z } = require("zod");

const app = express();
app.use(cors());
app.use(express.json());

const MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024;
const UPLOADS_DIR = path.resolve("uploads");
const isDevelopment = process.env.NODE_ENV !== "production";

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, `${crypto.randomUUID()}.pdf`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_PDF_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    const isPdfMime = file.mimetype === "application/pdf";
    const isPdfExtension = file.originalname.toLowerCase().endsWith(".pdf");

    if (!isPdfMime || !isPdfExtension) {
      return cb(new Error("Only PDF files are allowed."));
    }

    cb(null, true);
  },
});

const cleanupFile = async (filePath) => {
  if (!filePath) return;

  try {
    const safePath = path.join(UPLOADS_DIR, path.basename(filePath));
    await fsPromises.unlink(safePath);
    console.log(`Deleted temp file: ${safePath}`);
  } catch (err) {
    console.error(`Failed to delete temp file ${filePath}:`, err.message);
  }
};

const sendUploadError = (res, statusCode, message, details = message) => {
  console.error("Upload failed:", details);
  return res.status(statusCode).json({
    error: message,
    details,
  });
};

const extractServiceDetails = (err) => {
  const upstreamDetails = err.response?.data;
  return upstreamDetails?.detail || upstreamDetails?.error || upstreamDetails || err.message;
};

const askSchema = z.object({
  question: z.string().trim().min(1, "Question is required."),
  session_id: z.string().uuid("Invalid session ID format."),
});

const summarizeSchema = z.object({
  session_id: z.string().uuid("Invalid session ID format."),
});

const validateAskBody = (body) => {
  const result = askSchema.safeParse(body);

  if (!result.success) {
    return {
      error: "Validation failed",
    };
  }

  return {
    value: result.data,
  };
};

const validateSummarizeBody = (body) => {
  const result = summarizeSchema.safeParse(body);

  if (!result.success) {
    return {
      error: "Validation failed",
    };
  }

  return {
    value: result.data,
  };
};

app.post("/upload", upload.single("file"), async (req, res) => {
  const uploadedFilePath = req.file?.path;
  const absoluteFilePath = uploadedFilePath ? path.resolve(uploadedFilePath) : null;
  const sessionId = req.body?.session_id || null;

  try {
    if (!req.file) {
      return sendUploadError(
        res,
        400,
        "No file uploaded. Use form field name 'file'."
      );
    }

    if (req.file.size === 0) {
      await cleanupFile(uploadedFilePath);
      return sendUploadError(
        res,
        400,
        "Uploaded PDF is empty. Please choose a valid PDF file."
      );
    }

    const response = await axios.post("http://localhost:5000/process-pdf", {
      filePath: absoluteFilePath,
      filename: req.file.originalname,
      session_id: sessionId,
    });

    await cleanupFile(uploadedFilePath);

    return res.json({
      message: "PDF uploaded & processed successfully!",
      session_id: response.data.session_id,
      document: response.data.document,
      documents: response.data.documents || [],
    });
  } catch (err) {
    await cleanupFile(uploadedFilePath);

    const statusCode = err.response?.status || (err.code === "ECONNREFUSED" ? 502 : 500);
    const details = extractServiceDetails(err);
    console.error("Upload processing failed:", details);

    return res.status(statusCode).json({
      error: typeof details === "string" ? details : "PDF processing failed",
      details: isDevelopment ? details : "Internal processing error",
    });
  }
});

app.post("/ask", async (req, res) => {
  const validation = validateAskBody(req.body);

  if (validation.error) {
    return res.status(400).json({
      error: validation.error,
    });
  }

  const { question, session_id } = validation.value;

  try {
    const response = await axios.post("http://localhost:5000/ask", {
      question,
      session_id,
    });

    return res.json({
      answer: response.data.answer,
      sources: response.data.sources ?? [],
    });
  } catch (err) {
    const statusCode = err.response?.status || 500;
    const details = extractServiceDetails(err);
    console.error("Question answering failed:", details);

    return res.status(statusCode).json({
      error: typeof details === "string" ? details : "Error answering question",
      details: isDevelopment ? details : "Internal processing error",
    });
  }
});

app.post("/summarize", async (req, res) => {
  const validation = validateSummarizeBody(req.body);

  if (validation.error) {
    return res.status(400).json({
      error: validation.error,
    });
  }

  try {
    const response = await axios.post(
      "http://localhost:5000/summarize",
      validation.value
    );

    return res.json({
      summary: response.data.summary,
    });
  } catch (err) {
    const statusCode = err.response?.status || 500;
    const details = extractServiceDetails(err);
    console.error("Summarization failed:", details);

    return res.status(statusCode).json({
      error: typeof details === "string" ? details : "Error summarizing PDF",
      details: isDevelopment ? details : "Internal processing error",
    });
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const statusCode = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "File too large. Please choose a PDF under 20MB."
        : "File upload error";

    return res.status(statusCode).json({
      error: message,
      details: err.message,
    });
  }

  if (err) {
    console.error("Upload failed:", err.message);
    return res.status(400).json({
      error: err.message || "Invalid upload request.",
    });
  }

  next();
});

if (require.main === module) {
  app.listen(4000, () => console.log("Backend running on http://localhost:4000"));
}

module.exports = { app, askSchema, summarizeSchema };
