const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const fsPromises = require("fs/promises");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Storage for uploaded PDFs
const upload = multer({ dest: "uploads/" });

// Centralized helper to safely delete a temp file
async function cleanupFile(filePath) {
  try {
    await fsPromises.unlink(filePath);
  } catch (err) {
    console.error("Failed to delete temp file:", err);
  }
}

// Route: Upload PDF
app.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded. Use form field name 'file'." });
  }

  // Use req.file.path directly — multer resolves this relative to the working directory
  const filePath = req.file.path;

  try {
    // Send PDF to Python service
    const response = await axios.post("http://localhost:5000/process-pdf", {
      filePath: path.resolve(filePath),
    });

    // Await cleanup to ensure no orphan temp files
    await cleanupFile(filePath);

    res.json({
      message: "PDF uploaded & processed successfully!",
      session_id: response.data.session_id,
    });
  } catch (err) {
    // Ensure cleanup even on failure using the same helper
    await cleanupFile(filePath);
    const details = err.response?.data || err.message;
    console.error("Upload processing failed:", details);
    res.status(500).json({ error: "PDF processing failed", details });
  }
});

// Route: Ask Question
app.post("/ask", async (req, res) => {
  const { question, session_id } = req.body;
  try {
    const response = await axios.post("http://localhost:5000/ask", {
      question,
      session_id,
    });

    res.json({ answer: response.data.answer });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Error answering question" });
  }
});

app.post("/summarize", async (req, res) => {
  try {
    const response = await axios.post("http://localhost:5000/summarize", req.body || {});
    res.json({ summary: response.data.summary });
  } catch (err) {
    const details = err.response?.data || err.message;
    console.error("Summarization failed:", details);
    res.status(500).json({ error: "Error summarizing PDF", details });
  }
});

app.listen(4000, () => console.log("Backend running on http://localhost:4000"));
