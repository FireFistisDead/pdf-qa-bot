
import React, { useRef, useState } from "react";
import axios from "axios";
import { saveAs } from "file-saver";
import Papa from "papaparse";
import 'bootstrap/dist/css/bootstrap.min.css';
import { Container, Row, Col } from 'react-bootstrap';
import Navbar from "./components/Navbar/Navbar";
import UploadSection from "./components/UploadSection/UploadSection";
import PdfViewer from "./components/PdfViewer/PdfViewer";
import ChatSection from "./components/ChatSection/ChatSection";
import toast, { Toaster } from "react-hot-toast";

const API_BASE = process.env.REACT_APP_API_URL || "";



function App() {
  const fileInputRef = useRef(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [pdfs, setPdfs] = useState([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [chat, setChat] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [question, setQuestion] = useState("");
 
  const [asking, setAsking] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [summarizing, setSummarizing] = useState(false);

  const getApiErrorMessage = (error, fallbackMessage) => {
    if (error.code === "ECONNABORTED") {
      return "Request timed out. Please try again.";
    }
    if (!error.response) {
      return "Network error. Please check if the backend server is running.";
    }
    return error.response?.data?.error || error.response?.data?.detail || fallbackMessage;
  };

  const handleFileChange = (event) => {
    setSelectedFiles(Array.from(event.target.files || []));
  };

  // Multi-PDF upload
  const uploadPDF = async () => {
  if (selectedFiles.length === 0) {
    toast.error("Please select at least one PDF file first.");
    return;
  }

  const invalidFile = selectedFiles.find(
    (candidateFile) =>
      candidateFile.type !== "application/pdf" &&
      !candidateFile.name.toLowerCase().endsWith(".pdf")
  );

  if (invalidFile) {
    toast.error(`Only PDF files are allowed: ${invalidFile.name}`);
    return;
  }

  // Validate file size (20MB limit)
  const maxSize = 20 * 1024 * 1024; // 20MB in bytes
  const oversizedFile = selectedFiles.find((candidateFile) => candidateFile.size > maxSize);
  if (oversizedFile) {
    toast.error(`${oversizedFile.name} exceeds the 20MB limit.`);
    return;
  }

  setUploading(true);
  const loadingToast = toast.loading(
    selectedFiles.length === 1 ? "Uploading PDF..." : `Uploading ${selectedFiles.length} PDFs...`
  );
  const uploadedPdfs = [];

  try {
    let activeSessionId = sessionId;

    for (const pdfFile of selectedFiles) {
      const formData = new FormData();
      formData.append("file", pdfFile);
      if (activeSessionId) {
        formData.append("session_id", activeSessionId);
      }

      const res = await axios.post(`${API_BASE}/upload`, formData, {
        timeout: 60000,
      });

      activeSessionId = res.data.session_id;
      const documentMetadata = res.data.document || {};
      const uploadedPdf = {
        name: documentMetadata.filename || pdfFile.name,
        file: pdfFile,
        url: URL.createObjectURL(pdfFile),
        document_id: documentMetadata.document_id,
        uploaded_at: documentMetadata.uploaded_at,
      };

      uploadedPdfs.push(uploadedPdf);
      setSessionId(activeSessionId);
      setPdfs(prev => [...prev, uploadedPdf]);
      setSelectedDocumentId(uploadedPdf.document_id);
    }

    setSelectedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    toast.success(
      selectedFiles.length === 1
        ? "PDF added to this session."
        : `${selectedFiles.length} PDFs added to this session.`,
      {
      id: loadingToast,
      }
    );

  } catch (e) {
    const message = uploadedPdfs.length > 0
      ? `${uploadedPdfs.length} PDF(s) uploaded, but one file failed: ${getApiErrorMessage(e, "Upload failed.")}`
      : getApiErrorMessage(e, "Upload failed. Please try again.");
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
    
    if (!sessionId || pdfs.length === 0) {
      toast.error("Please upload at least one PDF document first.");
      return;
    }

    const submittedQuestion = question.trim();
    setAsking(true);
    setChat(prev => [...prev, { role: "user", text: submittedQuestion }]);
    
    try {
      const res = await axios.post(`${API_BASE}/ask`, { question: submittedQuestion, session_id: sessionId }, {
        timeout: 60000, // 60 second timeout for AI responses
      });
      setChat(prev => [...prev, { role: "bot", text: res.data.answer }]);
    } catch (e) {
      const errorMessage = getApiErrorMessage(e, "Error getting answer. Please try again.");
      toast.error(errorMessage);
      setChat(prev => [...prev, { role: "bot", text: errorMessage }]);
    }
    setQuestion("");
    setAsking(false);
  };

  // Summarization
  const summarizePDF = async () => {
    if (!sessionId || pdfs.length === 0) {
      toast.error("Please upload at least one PDF document first.");
      return;
    }
    
    setSummarizing(true);
    const loadingToast = toast.loading("Summarizing uploaded documents...");
    
    try {
      const res = await axios.post(`${API_BASE}/summarize`, { session_id: sessionId }, {
        timeout: 60000, // 60 second timeout for summarization
      });
      setChat(prev => [...prev, { role: "bot", text: res.data.summary }]);
      toast.success("Documents summarized successfully!", {
        id: loadingToast,
      });
    } catch (e) {
      const errorMessage = getApiErrorMessage(e, "Error summarizing documents. Please try again.");
      toast.error(errorMessage, {
        id: loadingToast,
      });
      setChat(prev => [...prev, { role: "bot", text: errorMessage }]);
    }
    setSummarizing(false);
  };

  // Export chat
  const exportChat = (type) => {
    if (!sessionId) return;
    if (type === "csv") {
      const csv = Papa.unparse(chat);
      const blob = new Blob([csv], { type: "text/csv" });
      saveAs(blob, `document-session-chat.csv`);
    } else if (type === "pdf") {
      // Simple text PDF export
      const text = chat.map(msg => `${msg.role}: ${msg.text}`).join("\n\n");
      const blob = new Blob([text], { type: "application/pdf" });
      saveAs(blob, `document-session-chat.pdf`);
    }
  };

  // PDF Viewer
  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    setPageNumber(1);
  };

  const themeClass = darkMode ? "bg-dark text-light" : "bg-light text-dark";

  const currentPdf = pdfs.find(pdf => pdf.document_id === selectedDocumentId);
  const currentPdfFile = currentPdf?.file || null;
  const currentPdfUrl = currentPdf?.url || null;
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
  files={selectedFiles}
  fileInputRef={fileInputRef}
  uploadedDocuments={pdfs}
  selectedDocumentId={selectedDocumentId}
  setSelectedDocumentId={setSelectedDocumentId}
  handleFileChange={handleFileChange}
  handleUpload={uploadPDF}
/>
        <Row className="justify-content-center">
  <Col md={11}>
    
    <Row className="g-4">

      {/* LEFT PANEL — PDF VIEWER */}
      <Col md={7}>
  <PdfViewer
    darkMode={darkMode}
    currentPdfFile={currentPdfFile}
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
  currentChat={chat}
  question={question}
  setQuestion={setQuestion}
  askQuestion={askQuestion}
  asking={asking}
  summarizePDF={summarizePDF}
  summarizing={summarizing}
  hasSession={Boolean(sessionId)}
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
