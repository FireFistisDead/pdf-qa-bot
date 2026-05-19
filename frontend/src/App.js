
import React, { useState } from "react";
import axios from "axios";
import { pdfjs } from "react-pdf";
import { saveAs } from "file-saver";
import Papa from "papaparse";
import 'bootstrap/dist/css/bootstrap.min.css';
import { Container, Row, Col } from 'react-bootstrap';
import Navbar from "./components/Navbar/Navbar";
import UploadSection from "./components/UploadSection/UploadSection";
import PdfViewer from "./components/PdfViewer/PdfViewer";
import ChatSection from "./components/ChatSection/ChatSection";
import toast, { Toaster } from "react-hot-toast";
pdfjs.GlobalWorkerOptions.workerSrc =
  `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const API_BASE = process.env.REACT_APP_API_URL || "";



function App() {
  const [file, setFile] = useState(null);
  const [pdfs, setPdfs] = useState([]); // {name, url, chat: []}
  const [selectedPdf, setSelectedPdf] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [question, setQuestion] = useState("");
 
  const [asking, setAsking] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [summarizing, setSummarizing] = useState(false);
  const isProcessing = uploading || asking || summarizing;

  // Multi-PDF upload
  const uploadPDF = async () => {
  if (!file) {
    toast.error("Please select a PDF file first.");
    return;
  }

  // Validate file type
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    toast.error("Only PDF files are allowed. Please select a valid PDF document.");
    return;
  }

  // Validate file size (20MB limit)
  const maxSize = 20 * 1024 * 1024; // 20MB in bytes
  if (file.size > maxSize) {
    toast.error("File size exceeds 20MB limit. Please choose a smaller file.");
    return;
  }

  setUploading(true);
  const loadingToast = toast.loading("Uploading PDF...");

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await axios.post(`${API_BASE}/upload`, formData, {
      timeout: 30000, // 30 second timeout
    });

    const url = URL.createObjectURL(file);

    setPdfs(prev => [
      ...prev,
      {
        name: file.name,
        url,
        chat: [],
        session_id: res.data.session_id
      }
    ]);

    setSelectedPdf(file.name);
    setFile(null);
    toast.success("PDF uploaded successfully!", {
      id: loadingToast,
    });

  } catch (e) {
    let message = "Upload failed. Please try again.";
    
    if (e.code === "ECONNABORTED") {
      message = "Upload timed out. Please check your connection and try again.";
    } else if (!e.response) {
      message = "Network error. Please check if the backend server is running.";
    } else if (e.response?.status === 413) {
      message = "File too large. Please choose a file under 20MB.";
    } else if (e.response?.status === 500) {
      message = "Server error. Please try again later.";
    } else if (e.response?.data?.error) {
      message = e.response.data.error;
    }
    
    toast.error(message, {
      id: loadingToast,
    });

  } finally {
    setUploading(false);
  }
};

  // Chat per PDF
  const askQuestion = async () => {
    if (!question.trim()) {
      toast.error("Please enter a question before submitting.");
      return;
    }
    
    if (!selectedPdf) {
      toast.error("Please upload and select a PDF document first.");
      return;
    }
    
    const currentPdf = pdfs.find(p => p.name === selectedPdf);
    if (!currentPdf || !currentPdf.session_id) {
      toast.error("Invalid session. Please upload the PDF again.");
      return;
    }
    
    setAsking(true);
    setPdfs(prev => prev.map(pdf => pdf.name === selectedPdf ? { ...pdf, chat: [...pdf.chat, { role: "user", text: question }] } : pdf));
    
    try {
      const res = await axios.post(`${API_BASE}/ask`, { question, session_id: currentPdf.session_id }, {
        timeout: 60000, // 60 second timeout for AI responses
      });
      setPdfs(prev => prev.map(pdf => pdf.name === selectedPdf ? { ...pdf, chat: [...pdf.chat, { role: "bot", text: res.data.answer }] } : pdf));
    } catch (e) {
      let errorMessage = "Error getting answer. Please try again.";
      
      if (e.code === "ECONNABORTED") {
        errorMessage = "Request timed out. The AI is taking too long to respond. Please try a simpler question.";
      } else if (!e.response) {
        errorMessage = "Network error. Please check if the backend server is running.";
      } else if (e.response?.status === 404) {
        errorMessage = "Session not found. Please upload the PDF again.";
      } else if (e.response?.status === 500) {
        errorMessage = "Server error. Please try again later.";
      } else if (e.response?.data?.error) {
        errorMessage = e.response.data.error;
      }
      
      toast.error(errorMessage);
      setPdfs(prev => prev.map(pdf => pdf.name === selectedPdf ? { ...pdf, chat: [...pdf.chat, { role: "bot", text: errorMessage }] } : pdf));
    }
    setQuestion("");
    setAsking(false);
  };

  // Summarization
  const summarizePDF = async () => {
    if (!selectedPdf) {
      toast.error("Please upload and select a PDF document first.");
      return;
    }
    
    const currentPdf = pdfs.find(p => p.name === selectedPdf);
    if (!currentPdf || !currentPdf.session_id) {
      toast.error("Invalid session. Please upload the PDF again.");
      return;
    }
    
    setSummarizing(true);
    const loadingToast = toast.loading("Summarizing PDF...");
    
    try {
      const res = await axios.post(`${API_BASE}/summarize`, { pdf: selectedPdf, session_id: currentPdf.session_id }, {
        timeout: 60000, // 60 second timeout for summarization
      });
      setPdfs(prev => prev.map(pdf => pdf.name === selectedPdf ? { ...pdf, chat: [...pdf.chat, { role: "bot", text: res.data.summary }] } : pdf));
      toast.success("PDF summarized successfully!", {
        id: loadingToast,
      });
    } catch (e) {
      let errorMessage = "Error summarizing PDF. Please try again.";
      
      if (e.code === "ECONNABORTED") {
        errorMessage = "Summarization timed out. The document might be too large. Please try again.";
      } else if (!e.response) {
        errorMessage = "Network error. Please check if the backend server is running.";
      } else if (e.response?.status === 404) {
        errorMessage = "Session not found. Please upload the PDF again.";
      } else if (e.response?.status === 500) {
        errorMessage = "Server error. Please try again later.";
      } else if (e.response?.data?.error) {
        errorMessage = e.response.data.error;
      }
      
      toast.error(errorMessage, {
        id: loadingToast,
      });
      setPdfs(prev => prev.map(pdf => pdf.name === selectedPdf ? { ...pdf, chat: [...pdf.chat, { role: "bot", text: errorMessage }] } : pdf));
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
    <>
    <Toaster
  position="top-right"
  toastOptions={{
    duration: 3500,

    style: {
      background: "#111827",
      color: "#fff",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "16px",
      padding: "14px 16px",
      backdropFilter: "blur(12px)",
      boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
    },

    success: {
      iconTheme: {
        primary: "#8B5CF6",
        secondary: "#fff",
      },
    },

    error: {
      iconTheme: {
        primary: "#EF4444",
        secondary: "#fff",
      },
    },
  }}
/>
    <div className={themeClass} style={{ minHeight: "100vh", transition: "background 0.3s" }}>
      <Navbar darkMode={darkMode} setDarkMode={setDarkMode} />
      <Container>
        <UploadSection
  uploading={uploading}
  darkMode={darkMode}
  file={file}
  handleFileChange={(e) => setFile(e.target.files[0])}
  handleUpload={uploadPDF}
/>
        <Row className="justify-content-center">
  <Col md={11}>
    
    <Row className="g-4">

      {/* LEFT PANEL — PDF VIEWER */}
      <Col md={7}>
  <PdfViewer
    darkMode={darkMode}
    currentPdfUrl={currentPdfUrl}
    pageNumber={pageNumber}
    numPages={numPages}
    setPageNumber={setPageNumber}
    onDocumentLoadSuccess={onDocumentLoadSuccess}
  />
</Col>
      {/* RIGHT PANEL — CHAT */}
      <Col md={5}>
        <ChatSection
  darkMode={darkMode}
  currentChat={currentChat}
  question={question}
  setQuestion={setQuestion}
  askQuestion={askQuestion}
  asking={asking}
  summarizePDF={summarizePDF}
  summarizing={summarizing}
  selectedPdf={selectedPdf}
  exportChat={exportChat}
/>
      </Col>

    </Row>
  </Col>
</Row>
          
      </Container>
    </div>
    </>
  );
}

export default App;
