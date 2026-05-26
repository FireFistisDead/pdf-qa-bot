import React, { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { pdfjs } from "react-pdf";
import "bootstrap/dist/css/bootstrap.min.css";
import { Container, Row, Col } from "react-bootstrap";
import Navbar from "./components/Navbar/Navbar";
import UploadCard from "./components/UploadCard/UploadCard";
import PdfViewer from "./components/PdfViewer/PdfViewer";
import ChatPanel from "./components/ChatPanel/ChatPanel";
import toast, { Toaster } from "react-hot-toast";
import LandingPage from "./components/Landing/LandingPage";
import SignIn from "./components/Auth/SignIn";
import SignUp from "./components/Auth/SignUp";
import { AuthProvider } from "./contexts/AuthContext";
import Dashboard from "./components/Dashboard/Dashboard";

import { extractApiErrorMessage, uploadPdfApi, getSessionsApi } from "./services/api";

pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.min.js`;

function MainApp() {
  const [pdfs, setPdfs] = useState([]); // {id, name, document_id, url, chat: [], session_id: ""}
  const [selectedPdf, setSelectedPdf] = useState(null);
  const [pdfJumpTarget, setPdfJumpTarget] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  const loadKnownSessions = React.useCallback(() => {
    try {
      const raw = localStorage.getItem("pdfqa_sessions");
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((s) => s && typeof s.session_id === "string" && typeof s.session_secret === "string")
        .map((s) => ({ session_id: s.session_id, session_secret: s.session_secret }));
    } catch (_) {
      return [];
    }
  }, []);

  const upsertKnownSession = React.useCallback((sessionId, sessionSecret) => {
    if (!sessionId || !sessionSecret) return;
    const existing = loadKnownSessions();
    const next = [
      { session_id: sessionId, session_secret: sessionSecret },
      ...existing.filter((s) => s.session_id !== sessionId),
    ];
    localStorage.setItem("pdfqa_sessions", JSON.stringify(next.slice(0, 50)));
  }, [loadKnownSessions]);

  React.useEffect(() => {
    // Load historical sessions on initial mount
    const fetchHistory = async () => {
      try {
        const knownSessions = loadKnownSessions();
        const sessions = await getSessionsApi(knownSessions);
        if (sessions && sessions.length > 0) {
          const secretById = new Map(knownSessions.map((s) => [s.session_id, s.session_secret]));
          const apiUrl = process.env.REACT_APP_API_URL || "";
          const formattedPdfs = sessions.map(s => {
            const doc = s.documents?.[0];
            let url = null;
            if (doc) {
              const rawUrl = doc.static_url || (doc.filename ? `/uploads/${doc.filename}` : null);
              if (rawUrl) {
                url = rawUrl.startsWith('http') ? rawUrl : `${apiUrl}${rawUrl}`;
              }
            }
            return {
              id: doc?.document_id || s.session_id,
              name: doc?.filename || "Unknown PDF",
              document_id: doc?.document_id || null,
              url: url,
              chat: s.chat || [],
              session_id: s.session_id,
              session_secret: secretById.get(s.session_id) || null,
            };
          });
          setPdfs(formattedPdfs);
          setSelectedPdf(formattedPdfs[0].id);
        }
      } catch (e) {
        console.error("Failed to load session history:", e);
      }
    };
    fetchHistory();
  }, [loadKnownSessions]);



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
      const currentPdfForUpload = pdfs.find(p => p.id === selectedPdf);
      const data = await uploadPdfApi(
        file,
        currentPdfForUpload?.session_id,
        currentPdfForUpload?.session_secret,
      );
      const apiUrl = process.env.REACT_APP_API_URL || "";
      const serverUrl = data.url ? (data.url.startsWith('http') ? data.url : `${apiUrl}${data.url}`) : null;
      const url = URL.createObjectURL(file);
      const pdfId = data.document?.document_id || data.session_id;

      if (data.session_id && data.session_secret) {
        upsertKnownSession(data.session_id, data.session_secret);
      }

    setPdfs((prev) => {
  const updated = [
    ...prev,
    {
      id: pdfId,
      name: file.name,
      document_id: data.document?.document_id || null,
      url: serverUrl || url,
      chat: [],
      session_id: data.session_id,
      session_secret: data.session_secret || null,
    },
  ];
 
  if (prev.length === 0) {
    setSelectedPdf(pdfId);
  } else {
    // Switch to the newly uploaded pdf immediately
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
    const matchingPdf = pdfs.find(
      (pdf) =>
        source.document &&
        pdf.name.localeCompare(source.document, undefined, {
          sensitivity: "accent",
        }) === 0,
    );

    if (!matchingPdf) {
      toast.error("Source document is not available in the current session.");
      return;
    }

    setSelectedPdf(matchingPdf.id);
    setPdfJumpTarget({
      document: matchingPdf.name,
      document_id: matchingPdf.document_id,
      page: source.page,
      requestedAt: Date.now(),
    });
  };

  const handleUpdateLastBotMessage = (text, streaming, sources, mode) => {
    setPdfs((prev) =>
      prev.map((pdf) => {
        if (pdf.id !== selectedPdf) return pdf;

        const chat = [...pdf.chat];
        for (let i = chat.length - 1; i >= 0; i--) {
          if (chat[i].role === "bot") {
            chat[i] = {
              ...chat[i],
              text: text !== null ? text : chat[i].text,
              streaming,
              sources: sources !== undefined ? sources : chat[i].sources,
              mode: mode !== undefined ? mode : chat[i].mode,
            };
            break;
          }
        }

        return { ...pdf, chat };
      }),
    );
  };

  const themeClass = darkMode ? "bg-dark text-light" : "bg-light text-dark";

  const currentPdf = pdfs.find((pdf) => pdf.id === selectedPdf);
  const currentChat = currentPdf?.chat || [];
  const currentPdfUrl = currentPdf?.url || null;
  const currentPdfSessionId = currentPdf?.session_id || null;
  const currentPdfSessionSecret = currentPdf?.session_secret || null;
  const currentPdfName = currentPdf?.name || null;

  // Compute Heatmap Data for the current document
  const heatmapCounts = {};
  if (currentChat && currentChat.length > 0) {
    currentChat.forEach((msg) => {
      if (msg.role === "bot" && !msg.streaming && Array.isArray(msg.sources)) {
        // deduplicate sources per message by page
        const uniquePages = new Set();
        msg.sources.forEach((source) => {
           if (source.page && source.document && currentPdfName && source.document.localeCompare(currentPdfName, undefined, { sensitivity: "accent" }) === 0) {
             uniquePages.add(source.page);
           }
        });
        uniquePages.forEach((page) => {
           heatmapCounts[page] = (heatmapCounts[page] || 0) + 1;
        });
      }
    });
  }
  
  const heatmapData = {};
  let maxCount = 0;
  for (const page in heatmapCounts) {
    if (heatmapCounts[page] > maxCount) {
      maxCount = heatmapCounts[page];
    }
  }
  for (const page in heatmapCounts) {
    if (heatmapCounts[page] >= 2) {
      heatmapData[page] = heatmapCounts[page] / maxCount;
    } else {
      heatmapData[page] = 0;
    }
  }

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
          success: { iconTheme: { primary: "#8B5CF6", secondary: "#fff" } },
          error: { iconTheme: { primary: "#EF4444", secondary: "#fff" } },
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
                <Col md={7}>
                  <PdfViewer
                    darkMode={darkMode}
                    currentPdfUrl={currentPdfUrl}
                    jumpTarget={pdfJumpTarget}
                    heatmapData={heatmapData}
                  />
                </Col>
                <Col md={5}>
                  <ChatPanel
                    darkMode={darkMode}
                    currentChat={currentChat}
                    selectedPdf={selectedPdf}
                    currentPdfName={currentPdfName}
                    currentPdfSessionId={currentPdfSessionId}
                    currentPdfSessionSecret={currentPdfSessionSecret}
                    onAppendMessage={handleAppendMessage}
                    onOpenSource={handleOpenSource}
                    onUpdateLastBotMessage={handleUpdateLastBotMessage}
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



function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/workspace" element={<MainApp />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
