const request = require('supertest');
const path = require('path');
const fs = require('fs');
const app = require('./server');

const uploadDir = path.join(__dirname, 'uploads');

afterAll(() => {
  if (fs.existsSync(uploadDir)) {
    fs.readdirSync(uploadDir).forEach((file) => {
      fs.unlinkSync(path.join(uploadDir, file));
    });
  }
});

describe('POST /upload', () => {
  it('should return 400 with a friendly message when a non-PDF file is uploaded (txt)', async () => {
    const txtBuffer = Buffer.from('This is a plain text file.');
    const res = await request(app)
      .post('/upload')
      .attach('file', txtBuffer, { filename: 'test.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toBe(
      'Only PDF files are supported. Please upload a valid .pdf file.'
    );
  });

  it('should return 400 with a friendly message when a non-PDF file is uploaded (jpg)', async () => {
    const imgBuffer = Buffer.from('fake image data');
    const res = await request(app)
      .post('/upload')
      .attach('file', imgBuffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toBe(
      'Only PDF files are supported. Please upload a valid .pdf file.'
    );
  });

  it('should return 400 with a friendly message when a non-PDF file is uploaded (docx)', async () => {
    const docxBuffer = Buffer.from('fake docx content');
    const res = await request(app)
      .post('/upload')
      .attach('file', docxBuffer, {
        filename: 'document.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toBe(
      'Only PDF files are supported. Please upload a valid .pdf file.'
    );
  });

  it('should return 200 when a valid PDF file is uploaded', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.4 fake pdf content');
    const res = await request(app)
      .post('/upload')
      .attach('file', pdfBuffer, { filename: 'document.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'File uploaded successfully.');
    expect(res.body).toHaveProperty('filename');
    expect(res.body).toHaveProperty('originalname', 'document.pdf');
  });

  it('should return 400 when no file is uploaded', async () => {
    const res = await request(app).post('/upload');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'No file uploaded.');
  });
});
