require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { OpenAI } = require('openai');
const pdfParse = require('pdf-parse');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(
      new multer.MulterError(
        'LIMIT_UNEXPECTED_FILE',
        'Only PDF files are supported. Please upload a valid .pdf file.'
      ),
      false
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// In-memory store for parsed PDF text (keyed by session/upload id)
const pdfStore = {};

app.post('/api/upload', (req, res) => {
  upload.single('pdf')(req, res, (err) => {
    if (err) {
      // Handle multer errors, including our custom fileFilter error
      if (err instanceof multer.MulterError) {
        if (
          err.code === 'LIMIT_UNEXPECTED_FILE' ||
          err.code === 'LIMIT_FILE_SIZE'
        ) {
          const message =
            err.code === 'LIMIT_FILE_SIZE'
              ? 'File is too large. Maximum allowed size is 20MB.'
              : err.field && err.field !== 'LIMIT_UNEXPECTED_FILE'
              ? err.message
              : 'Only PDF files are supported. Please upload a valid .pdf file.';
          return res.status(400).json({ error: message });
        }
        return res.status(400).json({ error: err.message });
      }
      // Unknown / unexpected errors
      return res.status(500).json({ error: 'An unexpected error occurred during upload.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Please select a PDF file.' });
    }

    const filePath = req.file.path;

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        return res.status(500).json({ error: 'Failed to read uploaded file.' });
      }

      pdfParse(data)
        .then((parsed) => {
          const docId = path.basename(filePath, path.extname(filePath));
          pdfStore[docId] = parsed.text;

          // Clean up file after parsing
          fs.unlink(filePath, () => {});

          return res.status(200).json({
            message: 'PDF uploaded and parsed successfully.',
            docId,
            pageCount: parsed.numpages,
          });
        })
        .catch(() => {
          fs.unlink(filePath, () => {});
          return res.status(422).json({
            error: 'Failed to parse PDF. The file may be corrupted or password-protected.',
          });
        });
    });
  });
});

app.post('/api/ask', async (req, res) => {
  const { docId, question } = req.body;

  if (!docId || !question) {
    return res.status(400).json({ error: 'docId and question are required.' });
  }

  const context = pdfStore[docId];
  if (!context) {
    return res.status(404).json({ error: 'Document not found. Please re-upload your PDF.' });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful assistant. Answer questions based only on the provided PDF content.',
        },
        {
          role: 'user',
          content: `PDF Content:\n${context.slice(0, 12000)}\n\nQuestion: ${question}`,
        },
      ],
    });

    const answer = completion.choices[0].message.content;
    return res.status(200).json({ answer });
  } catch (aiErr) {
    return res.status(500).json({ error: 'Failed to get an answer. Please try again.' });
  }
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
