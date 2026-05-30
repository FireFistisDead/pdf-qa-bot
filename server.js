require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { OpenAI } = require('openai');
const pdfParse = require('pdf-parse');

const app = express();
app.use(cors());
app.use(express.json());

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}-${file.originalname}`);
  },
});

const fileFilter = (_req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(
      Object.assign(
        new Error('Only PDF files are supported. Please upload a valid .pdf file.'),
        { code: 'INVALID_FILE_TYPE' }
      ),
      false
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 },
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post('/upload', (req, res, next) => {
  upload.single('pdf')(req, res, (err) => {
    if (err) {
      if (
        err.code === 'INVALID_FILE_TYPE' ||
        (err instanceof multer.MulterError === false && err.message)
      ) {
        return res.status(400).json({
          error: err.message || 'Only PDF files are supported. Please upload a valid .pdf file.',
        });
      }
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            error: 'File is too large. Maximum allowed size is 20 MB.',
          });
        }
        return res.status(400).json({ error: err.message });
      }
      return next(err);
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Please attach a PDF file.' });
    }

    res.json({ message: 'File uploaded successfully.', filename: req.file.filename });
  });
});

app.post('/ask', async (req, res) => {
  const { filename, question } = req.body;

  if (!filename || !question) {
    return res.status(400).json({ error: 'filename and question are required.' });
  }

  const filePath = path.join(uploadDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Uploaded file not found. Please re-upload your PDF.' });
  }

  try {
    const dataBuffer = fs.readFileSync(filePath);
    const parsed = await pdfParse(dataBuffer);
    const pdfText = parsed.text.slice(0, 12000);

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful assistant. Answer the user\'s question based on the provided PDF content.',
        },
        {
          role: 'user',
          content: `PDF Content:\n${pdfText}\n\nQuestion: ${question}`,
        },
      ],
    });

    const answer = completion.choices[0].message.content;
    res.json({ answer });
  } catch (err) {
    console.error('Error processing /ask:', err);
    res.status(500).json({ error: 'An error occurred while processing your request.' });
  }
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
