import React, { useState } from "react";
import { pdfjs } from "react-pdf";
import "bootstrap/dist/css/bootstrap.min.css";
import { Container, Row, Col } from "react-bootstrap";
import Navbar from "./components/Navbar/Navbar";
import UploadCard from "./components/UploadCard/UploadCard";
import PdfViewer from "./components/PdfViewer/PdfViewer";
import ChatPanel from "./components/ChatPanel/ChatPanel";
import toast, { Toaster } from "react-hot-toast";
import LandingPage from "./components/Landing/LandingPage";

import { extractApiErrorMessage, uploadPdfApi } from "./services/api";

pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.min.js`;

function App() {
  const [pdfs, setPdfs] = useState([]); // {id, name, document_id, url, chat: [], session_id: ""}
  const [selectedPdf, setSelectedPdf] = useState(null);
  const [pdfJumpTarget, setPdfJumpTarget] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  // Router logic to serve new UI on /new
  const path = window.location.pathname;
  if (path === '/new' || path === '/new/') {
    return <LandingPage />;
  }

  const handleUpload = async (file) => {
    // Validate file type
    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      toast.error(
        "Only PDF files are allowed. Please select a valid PDF document.",
      );
      return;
    }

    // Validate file size (20MB limit)
    const maxSize = 20 * 1024 * 1024; // 20MB in bytes
    if (file.size > maxSize) {
      toast.error(
        "File size exceeds 20MB limit. Please choose a smaller file.",
      );
      return;
    }

    setUploading(true);
    const loadingToast = toast.loading("Uploading PDF...");

    try {
      const data = await uploadPdfApi(file);
      const url = URL.createObjectURL(file);
      const pdfId = data.document?.document_id || data.session_id;

    setPdfs((prev) => {
  const updated = [
    ...prev,
    {
      id: pdfId,
      name: file.name,
      document_id: data.document?.document_id || null,
      url,
      chat: [],
      session_id: data.session_id,
    },
  ];
 
  if (prev.length === 0) {
    setSelectedPdf(pdfId);
  }
  return updated;
});
      toast.success("PDF uploaded successfully!", {
        id: loadingToast,
      });
    } catch (e) {
      let message = "Upload failed. Please try again.";

      if (e.code === "ECONNABORTED") {
        message =
          "Upload timed out. Please check your connection and try again.";
      } else if (!e.response) {
        message =
          "Network error. Please check if the backend server is running.";
      } else if (e.response?.status === 413) {
        message = "File too large. Please choose a file under 20MB.";
      } else if (e.response?.status === 500) {
        message = "Server error. Please try again later.";
      } else {
        message = extractApiErrorMessage(e, message);
      }

      toast.error(message, {
        id: loadingToast,
      });
    } finally {
      setUploading(false);
    }
  };

  const handleAppendMessage = (message) => {
    setPdfs((prev) =>
      prev.map((pdf) =>
        pdf.id === selectedPdf
          ? { ...pdf, chat: [...pdf.chat, message] }
          : pdf,
      ),
    );
  };
  const handleClearChat = () => {
  setPdfs((prev) =>
    prev.map((pdf) =>
      pdf.id === selectedPdf
        ? { ...pdf, chat: [] }
        : pdf,
    ),
  );
  setPdfJumpTarget(null);
};

  const handleOpenSource = (source) => {
    const page = Number(source?.page);

    if (!Number.isFinite(page)) {
      toast.error("Source page is unavailable.");
      return;
    }

    const matchingPdf = pdfs.find((pdf) => {
      if (source.document_id && pdf.document_id === source.document_id) {
        return true;
      }

      return (
        source.document &&
        pdf.name.localeCompare(source.document, undefined, {
          sensitivity: "accent",
        }) === 0
      );
    });

    if (!matchingPdf) {
      toast.error("Source document is not available in the current session.");
      return;
    }

    setSelectedPdf(matchingPdf.id);
    setPdfJumpTarget({
      document: matchingPdf.name,
      document_id: matchingPdf.document_id,
      page,
      requestedAt: Date.now(),
    });
  };

  const themeClass = darkMode ? "bg-dark text-light" : "bg-light text-dark";

  const currentPdf = pdfs.find((pdf) => pdf.id === selectedPdf);
  const currentChat = currentPdf?.chat || [];
  const currentPdfUrl = currentPdf?.url || null;
  const currentPdfSessionId = currentPdf?.session_id || null;
  const currentPdfName = currentPdf?.name || null;

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
      <div
        className={themeClass}
        style={{ minHeight: "100vh", transition: "background 0.3s" }}
      >
        <Navbar darkMode={darkMode} setDarkMode={setDarkMode} />
        <Container>
          <UploadCard
            uploading={uploading}
            darkMode={darkMode}
            onUpload={handleUpload}
          />
          {/* PDF LIST */}
{pdfs.length > 0 && (
  <div style={{ marginBottom: "16px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
    {pdfs.map((pdf) => (
      <button
        key={pdf.id}
        onClick={() => {
          setSelectedPdf(pdf.id);
          setPdfJumpTarget(null);
        }}
        style={{
          padding: "8px 16px",
          borderRadius: "12px",
          border: "none",
          background: selectedPdf === pdf.id ? "#8B5CF6" : "#e0e0e0",
          color: selectedPdf === pdf.id ? "#fff" : "#333",
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        {pdf.name}
      </button>
    ))}
  </div>
)}
          <Row className="justify-content-center">
            <Col md={11}>
              <Row className="g-4">
                {/* LEFT PANEL — PDF VIEWER */}
                <Col md={7}>
                  <PdfViewer
                    darkMode={darkMode}
                    currentPdfUrl={currentPdfUrl}
                    jumpTarget={pdfJumpTarget}
                  />
                </Col>
                {/* RIGHT PANEL — CHAT */}
                <Col md={5}>
                  <ChatPanel
                    darkMode={darkMode}
                    currentChat={currentChat}
                    selectedPdf={selectedPdf}
                    currentPdfName={currentPdfName}
                    currentPdfSessionId={currentPdfSessionId}
                    onAppendMessage={handleAppendMessage}
                    onOpenSource={handleOpenSource}
                    handleClearChat={handleClearChat}
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
