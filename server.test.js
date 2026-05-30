const request = require('supertest');
const path = require('path');
const fs = require('fs');
const os = require('os');
const app = require('./server');

const tmpDir = os.tmpdir();

function createTempFile(filename, content) {
  const filePath = path.join(tmpDir, filename);
  fs.writeFileSync(filePath, content);
  return filePath;
}

function createFakePdf(filename) {
  const filePath = path.join(tmpDir, filename);
  fs.writeFileSync(filePath, '%PDF-1.4 fake pdf content');
  return filePath;
}

describe('POST /upload', () => {
  let fakePdfPath;
  let fakeTxtPath;
  let fakeJpgPath;
  let fakeDocxPath;
  let fakePngPath;

  beforeAll(() => {
    fakePdfPath = createFakePdf('test.pdf');
    fakeTxtPath = createTempFile('test.txt', 'Hello, world!');
    fakeJpgPath = createTempFile('test.jpg', 'fake jpg data');
    fakeDocxPath = createTempFile('test.docx', 'fake docx data');
    fakePngPath = createTempFile('test.png', 'fake png data');
  });

  afterAll(() => {
    [fakePdfPath, fakeTxtPath, fakeJpgPath, fakeDocxPath, fakePngPath].forEach(
      (f) => {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      }
    );
    const uploadDir = path.join(__dirname, 'uploads');
    if (fs.existsSync(uploadDir)) {
      fs.readdirSync(uploadDir).forEach((file) => {
        fs.unlinkSync(path.join(uploadDir, file));
      });
    }
  });

  test('should accept a valid PDF file and return 200', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('file', fakePdfPath, {
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'File uploaded successfully.');
    expect(res.body).toHaveProperty('filename');
    expect(res.body).toHaveProperty('originalname', 'test.pdf');
  });

  test('should reject a .txt file and return 400 with friendly message', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('file', fakeTxtPath, {
        contentType: 'text/plain',
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/Only PDF files are supported/i);
    expect(res.body.error).toMatch(/\.pdf/i);
  });

  test('should reject a .jpg file and return 400 with friendly message', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('file', fakeJpgPath, {
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/Only PDF files are supported/i);
  });

  test('should reject a .docx file and return 400 with friendly message', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('file', fakeDocxPath, {
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/Only PDF files are supported/i);
  });

  test('should reject a .png file and return 400 with friendly message', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('file', fakePngPath, {
        contentType: 'image/png',
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/Only PDF files are supported/i);
  });

  test('should return 400 when no file is provided', async () => {
    const res = await request(app).post('/upload');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'No file was uploaded.');
  });

  test('error message should not expose stack trace for invalid file type', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('file', fakeTxtPath, {
        contentType: 'text/plain',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).not.toMatch(/at Object\./i);
    expect(res.body.error).not.toMatch(/Error:/i);
    expect(res.body.error).not.toMatch(/stack/i);
  });

  test('error response should be JSON with correct content-type', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('file', fakeTxtPath, {
        contentType: 'text/plain',
      });

    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});
