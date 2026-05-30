const request = require('supertest');
const path = require('path');
const fs = require('fs');
const os = require('os');
const app = require('./server');

// ---------------------------------------------------------------------------
// Helpers – create minimal temp files for testing
// ---------------------------------------------------------------------------

function createTempFile(ext, content = 'dummy content') {
  const filePath = path.join(os.tmpdir(), `test-upload-${Date.now()}${ext}`);
  fs.writeFileSync(filePath, content);
  return filePath;
}

// Minimal valid 1-page PDF (hand-crafted, parseable by pdf-parse)
const MINIMAL_PDF_CONTENT = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]
   /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT /F1 12 Tf 100 700 Td (Hello World) Tj ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000266 00000 n \n0000000360 00000 n \ntrailer
<< /Size 6 /Root 1 0 R >>
startxref
441
%%EOF`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/upload – file type validation', () => {
  let txtFile;
  let pngFile;
  let docxFile;
  let pdfFile;

  beforeAll(() => {
    txtFile = createTempFile('.txt', 'This is plain text.');
    pngFile = createTempFile('.png', Buffer.from([0x89, 0x50, 0x4e, 0x47])); // PNG magic bytes
    docxFile = createTempFile('.docx', 'PK fake docx content');
    pdfFile = createTempFile('.pdf', MINIMAL_PDF_CONTENT);
  });

  afterAll(() => {
    [txtFile, pngFile, docxFile, pdfFile].forEach((f) => {
      try { fs.unlinkSync(f); } catch (_) {}
    });
  });

  test('returns 400 with friendly message when a .txt file is uploaded', async () => {
    const res = await request(app)
      .post('/api/upload')
      .attach('pdf', txtFile, { contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/Only PDF files are supported/i);
  });

  test('returns 400 with friendly message when a .png file is uploaded', async () => {
    const res = await request(app)
      .post('/api/upload')
      .attach('pdf', pngFile, { contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/Only PDF files are supported/i);
  });

  test('returns 400 with friendly message when a .docx file is uploaded', async () => {
    const res = await request(app)
      .post('/api/upload')
      .attach('pdf', docxFile, {
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/Only PDF files are supported/i);
  });

  test('error message does NOT contain a raw stack trace for invalid file type', async () => {
    const res = await request(app)
      .post('/api/upload')
      .attach('pdf', txtFile, { contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body.error).not.toMatch(/Error:/);
    expect(res.body.error).not.toMatch(/at Object/);
    expect(res.body.error).not.toMatch(/stack/);
  });

  test('returns 400 when no file is attached', async () => {
    const res = await request(app).post('/api/upload');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('accepts a valid PDF and returns 200 or 422 (parse issue with minimal pdf)', async () => {
    const res = await request(app)
      .post('/api/upload')
      .attach('pdf', pdfFile, { contentType: 'application/pdf' });

    // We accept either 200 (successfully parsed) or 422 (valid PDF type accepted
    // but minimal test PDF may not fully parse in all pdf-parse versions)
    expect([200, 422]).toContain(res.status);
    // Should NOT be a 400 type-rejection error
    if (res.status === 400) {
      // If somehow 400, it must NOT be the "only PDF" message
      expect(res.body.error).not.toMatch(/Only PDF files are supported/i);
    }
  });
});

describe('GET /health', () => {
  test('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('POST /api/ask – input validation', () => {
  test('returns 400 when docId is missing', async () => {
    const res = await request(app)
      .post('/api/ask')
      .send({ question: 'What is this about?' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('returns 400 when question is missing', async () => {
    const res = await request(app)
      .post('/api/ask')
      .send({ docId: 'some-doc-id' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('returns 404 when docId does not exist in store', async () => {
    const res = await request(app)
      .post('/api/ask')
      .send({ docId: 'nonexistent-doc-id-xyz', question: 'What is this?' });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/not found/i);
  });
});
