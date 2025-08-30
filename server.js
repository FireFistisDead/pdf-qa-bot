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
    const filePath = path.join(__dirname, req.file.path);

    // Send PDF to Python service
    await axios.post("http://localhost:5000/process-pdf", {
      filePath: filePath,
    });

    res.json({ message: "PDF uploaded & processed successfully!" });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "PDF processing failed" });
  }
});

// Route: Ask Question
app.post("/ask", async (req, res) => {
  const { question } = req.body;
  try {
    const response = await axios.post("http://localhost:5000/ask", {
      question,
    });

    res.json({ answer: response.data.answer });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Error answering question" });
  }
});

app.listen(4000, () => console.log("Backend running on http://localhost:4000"));
