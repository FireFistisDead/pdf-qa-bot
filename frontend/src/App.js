
import React, { useState } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import { Document, Page, pdfjs } from "react-pdf";
import { saveAs } from "file-saver";
import Papa from "papaparse";
import 'bootstrap/dist/css/bootstrap.min.css';
import { Container, Row, Col, Button, Form, Card, ToggleButton, ToggleButtonGroup, Spinner, Navbar, Nav, Dropdown } from 'react-bootstrap';
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.js`;



function App() {
  const [file, setFile] = useState(null);
  const [pdfs, setPdfs] = useState([]); // {name, url, chat: []}
  const [selectedPdf, setSelectedPdf] = useState(null);
  const [question, setQuestion] = useState("");
  const [uploading, setUploading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [summarizing, setSummarizing] = useState(false);

  // Multi-PDF upload
  const uploadPDF = async () => {
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("filePath", file);
    formData.append("pdfName", file.name);
    try {
  const res = await axios.post("http://localhost:5000/process-pdf", formData);
      const url = URL.createObjectURL(file);
      setPdfs(prev => [...prev, { name: file.name, url, chat: [] }]);
      setSelectedPdf(file.name);
      alert("PDF uploaded!");
    } catch (e) {
      alert("Upload failed.");
    }
    setUploading(false);
  };

  // Chat per PDF
  const askQuestion = async () => {
    if (!question.trim() || !selectedPdf) return;
    setAsking(true);
    setPdfs(prev => prev.map(pdf => pdf.name === selectedPdf ? { ...pdf, chat: [...pdf.chat, { role: "user", text: question }] } : pdf));
    try {
  const res = await axios.post("http://localhost:5000/ask", { question, pdf: selectedPdf });
      setPdfs(prev => prev.map(pdf => pdf.name === selectedPdf ? { ...pdf, chat: [...pdf.chat, { role: "bot", text: res.data.answer }] } : pdf));
    } catch (e) {
      setPdfs(prev => prev.map(pdf => pdf.name === selectedPdf ? { ...pdf, chat: [...pdf.chat, { role: "bot", text: "Error getting answer." }] } : pdf));
    }
    setQuestion("");
    setAsking(false);
  };

  // Summarization
  const summarizePDF = async () => {
    if (!selectedPdf) return;
    setSummarizing(true);
    try {
  const res = await axios.post("http://localhost:5000/summarize", { pdf: selectedPdf });
      setPdfs(prev => prev.map(pdf => pdf.name === selectedPdf ? { ...pdf, chat: [...pdf.chat, { role: "bot", text: res.data.summary }] } : pdf));
    } catch (e) {
      setPdfs(prev => prev.map(pdf => pdf.name === selectedPdf ? { ...pdf, chat: [...pdf.chat, { role: "bot", text: "Error summarizing PDF." }] } : pdf));
    }
    setSummarizing(false);
  };

  // Export chat
  const exportChat = (type) => {
    if (!selectedPdf) return;
    const chat = pdfs.find(pdf => pdf.name === selectedPdf)?.chat || [];
    if (type === "csv") {
      const csv = Papa.unparse(chat);
      const blob = new Blob([csv], { type: "text/csv" });
      saveAs(blob, `${selectedPdf}-chat.csv`);
    } else if (type === "pdf") {
      // Simple text PDF export
      const text = chat.map(msg => `${msg.role}: ${msg.text}`).join("\n\n");
      const blob = new Blob([text], { type: "application/pdf" });
      saveAs(blob, `${selectedPdf}-chat.pdf`);
    }
  };

  // PDF Viewer
  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    setPageNumber(1);
  };

  const themeClass = darkMode ? "bg-dark text-light" : "bg-light text-dark";

  const currentChat = pdfs.find(pdf => pdf.name === selectedPdf)?.chat || [];
  const currentPdfUrl = pdfs.find(pdf => pdf.name === selectedPdf)?.url || null;

  return (
    <div className={themeClass} style={{ minHeight: "100vh", transition: "background 0.3s" }}>
      <Navbar bg={darkMode ? "dark" : "primary"} variant={darkMode ? "dark" : "light"} expand="lg" className="mb-4">
        <Container>
          <Navbar.Brand href="#">PDF Q&A Bot</Navbar.Brand>
          <Nav className="ml-auto">
            <ToggleButtonGroup type="radio" name="theme" value={darkMode ? 1 : 0} onChange={() => setDarkMode(!darkMode)}>
              <ToggleButton id="tbg-light" value={0} variant={darkMode ? "outline-light" : "outline-dark"}>Light</ToggleButton>
              <ToggleButton id="tbg-dark" value={1} variant={darkMode ? "outline-light" : "outline-dark"}>Dark</ToggleButton>
            </ToggleButtonGroup>
          </Nav>
        </Container>
      </Navbar>
      <Container>
        <Row className="justify-content-center mb-4">
          <Col md={8}>
            <Card className={darkMode ? "bg-secondary text-light" : "bg-white text-dark"}>
              <Card.Body>
                <Form>
                  <Form.Group controlId="formFile" className="mb-3">
                    <Form.Label>Upload PDF</Form.Label>
                    <Form.Control type="file" onChange={e => setFile(e.target.files[0])} />
                  </Form.Group>
                  <Button variant="primary" onClick={uploadPDF} disabled={!file || uploading}>
                    {uploading ? <Spinner animation="border" size="sm" /> : "Upload"}
                  </Button>
                  {file && <span className="ms-3">{file.name}</span>}
                </Form>
                {pdfs.length > 0 && (
                  <Dropdown className="mt-3">
                    <Dropdown.Toggle variant="info" id="dropdown-pdf">
                      {selectedPdf || "Select PDF"}
                    </Dropdown.Toggle>
                    <Dropdown.Menu>
                      {pdfs.map(pdf => (
                        <Dropdown.Item key={pdf.name} onClick={() => setSelectedPdf(pdf.name)}>{pdf.name}</Dropdown.Item>
                      ))}
                    </Dropdown.Menu>
                  </Dropdown>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
        {currentPdfUrl && (
          <Row className="justify-content-center mb-4">
            <Col md={8}>
              <Card className={darkMode ? "bg-secondary text-light" : "bg-white text-dark"}>
                <Card.Body>
                  <div style={{ textAlign: "center" }}>
                    <Document file={currentPdfUrl} onLoadSuccess={onDocumentLoadSuccess}>
                      <Page pageNumber={pageNumber} />
                    </Document>
                    <div className="d-flex justify-content-between align-items-center mt-2">
                      <Button variant="outline-info" size="sm" disabled={pageNumber <= 1} onClick={() => setPageNumber(pageNumber - 1)}>Prev</Button>
                      <span>Page {pageNumber} of {numPages}</span>
                      <Button variant="outline-info" size="sm" disabled={pageNumber >= numPages} onClick={() => setPageNumber(pageNumber + 1)}>Next</Button>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        )}
        <Row className="justify-content-center">
          <Col md={8}>
            <Card className={darkMode ? "bg-secondary text-light" : "bg-white text-dark"}>
              <Card.Body style={{ minHeight: 300 }}>
                <h5>Chat</h5>
                <div style={{ maxHeight: 250, overflowY: "auto", marginBottom: 16 }}>
                  {currentChat.map((msg, i) => (
                    <div key={i} className={`d-flex ${msg.role === "user" ? "justify-content-end" : "justify-content-start"} mb-2`}>
                      <div className={`p-2 rounded ${msg.role === "user" ? "bg-primary text-light" : darkMode ? "bg-dark text-light" : "bg-light text-dark"}`} style={{ maxWidth: "80%" }}>
                        {msg.role === "bot" ? (
                          <ReactMarkdown>{msg.text}</ReactMarkdown>
                        ) : (
                          <span><strong>You:</strong> {msg.text}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <Form className="d-flex gap-2 mb-2">
                  <Form.Control
                    type="text"
                    placeholder="Ask a question..."
                    value={question}
                    onChange={e => setQuestion(e.target.value)}
                    disabled={asking}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); askQuestion(); } }}
                  />
                  <Button variant="success" onClick={askQuestion} disabled={asking || !question.trim() || !selectedPdf}>
                    {asking ? <Spinner animation="border" size="sm" /> : "Ask"}
                  </Button>
                </Form>
                <Button variant="warning" className="me-2" onClick={summarizePDF} disabled={summarizing || !selectedPdf}>
                  {summarizing ? <Spinner animation="border" size="sm" /> : "Summarize PDF"}
                </Button>
                <Button variant="outline-secondary" className="me-2" onClick={() => exportChat("csv")} disabled={!selectedPdf}>Export CSV</Button>
                <Button variant="outline-secondary" onClick={() => exportChat("pdf")} disabled={!selectedPdf}>Export PDF</Button>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
}

export default App;
