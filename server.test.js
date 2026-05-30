const request = require('supertest');
const path = require('path');
const fs = require('fs');
const os = require('os');
const app = require('./server');

// ---------------------------------------------------------------------------
// Helpers – create minimal in-memory buffers to act as uploaded files
// ---------------------------------------------------------------------------

function tmpFile(name, content) {
  const filePath = path.join(os.tmpdir(), name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

// Minimal valid PDF header so pdf-parse won't be needed for upload-only tests
const FAKE_PDF_CONTENT = Buffer.from('%PDF-1.4 fake content');
const FAKE_TXT_CONTENT = Buffer.from('This is a plain text file.');
const FAKE_PNG_CONTENT = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes

let fakePdfPath;
let fakeTxtPath;
let fakePngPath;
let fakeDocxPath;

beforeAll(() => {
  fakePdfPath = tmpFile('test.pdf', FAKE_PDF_CONTENT);
  fakeTxtPath = tmpFile('test.txt', FAKE_TXT_CONTENT);
  fakePngPath = tmpFile('test.png', FAKE_PNG_CONTENT);
  fakeDocxPath = tmpFile(
    'test.docx',
    Buffer.from('PK\x03\x04fake docx content')
  );
});

afterAll(() => {
  [fakePdfPath, fakeTxtPath, fakePngPath, fakeDocxPath].forEach((f) => {
    try { fs.unlinkSync(f); } catch (_) {}
  });
});

// ---------------------------------------------------------------------------
// POST /upload
// ---------------------------------------------------------------------------

describe('POST /upload – file type validation', () => {
  test('returns 400 with friendly message when a .txt file is uploaded', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('pdf', fakeTxtPath, { contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/only pdf files are supported/i);
  });

  test('returns 400 with friendly message when a .png image is uploaded', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('pdf', fakePngPath, { contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/only pdf files are supported/i);
  });

  test('returns 400 with friendly message when a .docx file is uploaded', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('pdf', fakeDocxPath, {
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/only pdf files are supported/i);
  });

  test('error message instructs user to upload a valid .pdf file', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('pdf', fakeTxtPath, { contentType: 'text/plain' });

    expect(res.body.error).toMatch(/\.pdf/i);
  });

  test('accepts a valid PDF file and returns 200', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('pdf', fakePdfPath, { contentType: 'application/pdf' });

    // The file is accepted at the upload stage (pdf-parse may fail on fake
    // content but the upload itself should succeed with 200).
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('filename');
  });

  test('returns 400 when no file is attached', async () => {
    const res = await request(app).post('/upload');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('error response is JSON, not a raw stack trace', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('pdf', fakeTxtPath, { contentType: 'text/plain' });

    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(typeof res.body.error).toBe('string');
    // Must not expose internal paths or stack traces
    expect(res.body.error).not.toMatch(/at Object\.<anonymous>/);
    expect(res.body.error).not.toMatch(/node_modules/);
  });
});

// ---------------------------------------------------------------------------
// POST /ask – basic validation (no OpenAI call needed)
// ---------------------------------------------------------------------------

describe('POST /ask – input validation', () => {
  test('returns 400 when filename is missing', async () => {
    const res = await request(app)
      .post('/ask')
      .send({ question: 'What is this about?' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('returns 400 when question is missing', async () => {
    const res = await request(app)
      .post('/ask')
      .send({ filename: 'some-file.pdf' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('returns 404 when referenced file does not exist', async () => {
    const res = await request(app)
      .post('/ask')
      .send({ filename: 'nonexistent-99999.pdf', question: 'Hello?' });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});
