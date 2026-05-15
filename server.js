const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Storage for uploaded PDFs
const upload = multer({ dest: "uploads/" });

// Route: Upload PDF
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded. Use form field name 'file'." });
    }

    const filePath = path.join(__dirname, req.file.path);

    // Send PDF to Python service
    const response = await axios.post("http://localhost:5000/process-pdf", {
      filePath: filePath,
    });

    // Clean up local file to prevent disk space bloat
    fs.unlink(filePath, (err) => {
      if (err) console.error("Failed to delete local file:", err);
    });

    res.json({ 
      message: "PDF uploaded & processed successfully!",
      session_id: response.data.session_id
    });
  } catch (err) {
    // Ensure cleanup even on failure
    if (req.file) {
      fs.unlink(path.join(__dirname, req.file.path), () => {});
    }
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
