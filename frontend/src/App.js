
import React from "react";
import { pdfjs } from "react-pdf";
import 'bootstrap/dist/css/bootstrap.min.css';
import { Container, Row, Col } from 'react-bootstrap';
import Navbar from "./components/Navbar/Navbar";
import UploadSection from "./components/UploadSection/UploadSection";
import PdfViewer from "./components/PdfViewer/PdfViewer";
import ChatSection from "./components/ChatSection/ChatSection";
import toast, { Toaster } from "react-hot-toast";
import usePdfWorkspace from "./hooks/usePdfWorkspace";

pdfjs.GlobalWorkerOptions.workerSrc =
  `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

function App() {
  const workspace = usePdfWorkspace();

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
    <div className={workspace.themeClass} style={{ minHeight: "100vh", transition: "background 0.3s" }}>
      <Navbar darkMode={workspace.darkMode} setDarkMode={workspace.setDarkMode} />
      <Container>
        <UploadSection
  uploading={workspace.uploading}
  darkMode={workspace.darkMode}
  file={workspace.file}
  handleFileChange={workspace.handleFileChange}
  handleUpload={workspace.uploadPDF}
/>
        <Row className="justify-content-center">
  <Col md={11}>
    
    <Row className="g-4">

      <Col md={7}>
  <PdfViewer
    darkMode={workspace.darkMode}
    currentPdfUrl={workspace.currentPdfUrl}
    pageNumber={workspace.pageNumber}
    numPages={workspace.numPages}
    setPageNumber={workspace.setPageNumber}
    onDocumentLoadSuccess={workspace.onDocumentLoadSuccess}
  />
</Col>
      <Col md={5}>
        <ChatSection
  darkMode={workspace.darkMode}
  currentChat={workspace.currentChat}
  question={workspace.question}
  setQuestion={workspace.setQuestion}
  askQuestion={workspace.askQuestion}
  asking={workspace.asking}
  summarizePDF={workspace.summarizePDF}
  summarizing={workspace.summarizing}
  selectedPdf={workspace.selectedPdf}
  exportChat={workspace.exportChat}
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
