import React, { useState, useCallback, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { pdfjs } from "react-pdf";
import "bootstrap/dist/css/bootstrap.min.css";
import { motion } from "framer-motion";

import Navbar from "./components/Navbar/Navbar";
import PdfViewer from "./components/PdfViewer/PdfViewer";
import ChatPanel from "./components/ChatPanel/ChatPanel";
import LandingPage from "./components/Landing/LandingPage";
import SignIn from "./components/Auth/SignIn";
import SignUp from "./components/Auth/SignUp";
import { AuthProvider } from "./contexts/AuthContext";
import Dashboard from "./components/Dashboard/Dashboard";
import StudyHub from "./components/StudyHub/StudyHub";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import Sidebar from "./components/Sidebar/Sidebar";
import { FAB, SearchModal } from "./components/ui";
import ToastConfig from "./components/ui/ToastConfig";

import toast from "react-hot-toast";
import { FiFileText } from "react-icons/fi";
import { extractApiErrorMessage, uploadPdfApi, getSessionsApi } from "./services/api";

pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.min.js`;

function MainApp() {
  const [pdfs, setPdfs] = useState([]);
  const [selectedPdf, setSelectedPdf] = useState(null);
  const [pdfJumpTarget, setPdfJumpTarget] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [knowledgeGapResults, setKnowledgeGapResults] = useState({});
  const { theme, toggleTheme } = useTheme();
  const darkMode = theme === "dark";

  const SESSION_STORAGE_KEY = "pdfqa_sessions";

  const encodePayload = (arr) => btoa(JSON.stringify(arr));
  const decodePayload = (raw) => {
    try {
      return JSON.parse(atob(raw));
    } catch (_) {
      return null;
    }
  };

  const loadKnownSessions = useCallback(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return [];
      const parsed = decodePayload(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (s) =>
            s &&
            typeof s.session_id === "string" &&
            s.session_id.trim() !== "" &&
            typeof s.session_secret === "string" &&
            s.session_secret.trim() !== ""
        )
        .map((s) => ({
          session_id: s.session_id.trim(),
          session_secret: s.session_secret.trim(),
        }));
    } catch (_) {
      return [];
    }
  }, []);

  const upsertKnownSession = useCallback(
    (sessionId, sessionSecret) => {
      if (!sessionId || !sessionSecret) return;
      if (typeof sessionId !== "string" || typeof sessionSecret !== "string")
        return;
      const existing = loadKnownSessions();
      const next = [
        { session_id: sessionId.trim(), session_secret: sessionSecret.trim() },
        ...existing.filter((s) => s.session_id !== sessionId.trim()),
      ];
      try {
        sessionStorage.setItem(
          SESSION_STORAGE_KEY,
          encodePayload(next.slice(0, 50))
        );
      } catch (_) {
        try {
          sessionStorage.setItem(
            SESSION_STORAGE_KEY,
            encodePayload(next.slice(0, 10))
          );
        } catch (_) {}
      }
    },
    [loadKnownSessions]
  );

  useEffect(() => {
    try {
      const legacy = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!legacy) return;
      let parsed;
      try {
        parsed = JSON.parse(legacy);
      } catch (_) {
        parsed = decodePayload(legacy);
      }
      if (!Array.isArray(parsed) || parsed.length === 0) {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        return;
      }
      const valid = parsed.filter(
        (s) =>
          s &&
          typeof s.session_id === "string" &&
          s.session_id.trim() !== "" &&
          typeof s.session_secret === "string" &&
          s.session_secret.trim() !== ""
      );
      if (valid.length > 0) {
        const existing = loadKnownSessions();
        const existingIds = new Set(existing.map((s) => s.session_id));
        const merged = [
          ...existing,
          ...valid.filter((s) => !existingIds.has(s.session_id.trim())),
        ].slice(0, 50);
        sessionStorage.setItem(
          SESSION_STORAGE_KEY,
          encodePayload(merged)
        );
      }
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (_) {
      try {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      } catch (_) {}
    }
  }, [loadKnownSessions]);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const knownSessions = loadKnownSessions();
        const sessions = await getSessionsApi(knownSessions);
        if (sessions && sessions.length > 0) {
          const secretById = new Map(
            knownSessions.map((s) => [s.session_id, s.session_secret])
          );
          const formattedPdfs = sessions.map((s) => {
            const doc = s.documents?.[0];
            return {
              id: doc?.document_id || s.session_id,
              name: doc?.filename || "Unknown PDF",
              document_id: doc?.document_id || null,
              url: null,
              chat: s.chat || [],
              session_id: s.session_id,
              session_secret: secretById.get(s.session_id) || null,
            };
          });
          setPdfs(formattedPdfs);
          setSelectedPdf(formattedPdfs[0]?.id || null);
        }
      } catch (e) {
        console.error("Failed to load session history:", e);
      }
    };
    fetchHistory();
  }, [loadKnownSessions]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleUpload = async (file) => {
    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      toast.error("Only PDF files are allowed.");
      return;
    }

    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error("File size exceeds 20MB limit.");
      return;
    }

    setUploading(true);
    const loadingToast = toast.loading("Uploading PDF...");

    try {
      const currentPdfForUpload = pdfs.find((p) => p.id === selectedPdf);
      const data = await uploadPdfApi(
        file,
        currentPdfForUpload?.session_id,
        currentPdfForUpload?.session_secret
      );
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
            url,
            chat: [],
            session_id: data.session_id,
            session_secret: data.session_secret || null,
          },
        ];
        setSelectedPdf(pdfId);
        return updated;
      });
      toast.success("PDF uploaded successfully!", { id: loadingToast });
    } catch (e) {
      let message = "Upload failed.";
      if (e.code === "ECONNABORTED") {
        message = "Upload timed out.";
      } else if (!e.response) {
        message = "Network error. Check if the backend is running.";
      } else if (e.response?.status === 413) {
        message = "File too large.";
      } else if (e.response?.status === 500) {
        message = "Server error.";
      } else {
        message = extractApiErrorMessage(e, message);
      }
      toast.error(message, { id: loadingToast });
    } finally {
      setUploading(false);
    }
  };

  const handleAppendMessage = (message) => {
    setPdfs((prev) =>
      prev.map((pdf) =>
        pdf.id === selectedPdf
          ? { ...pdf, chat: [...pdf.chat, message] }
          : pdf
      )
    );
  };

  const handleClearChat = () => {
    setPdfs((prev) =>
      prev.map((pdf) =>
        pdf.id === selectedPdf ? { ...pdf, chat: [] } : pdf
      )
    );
    setPdfJumpTarget(null);
  };

  const handleOpenSource = (source) => {
    const matchingPdf = pdfs.find(
      (pdf) =>
        source.document &&
        pdf.name.localeCompare(source.document, undefined, {
          sensitivity: "accent",
        }) === 0
    );

    if (!matchingPdf) {
      toast.error("Source document is not available.");
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
      })
    );
  };

  const currentPdf = pdfs.find((pdf) => pdf.id === selectedPdf);
  const currentChat = currentPdf?.chat || [];
  const currentPdfUrl = currentPdf?.url || null;
  const currentPdfSessionId = currentPdf?.session_id || null;
  const currentPdfSessionSecret = currentPdf?.session_secret || null;
  const currentPdfName = currentPdf?.name || null;
  const currentDocumentId = currentPdf?.document_id || null;

  const currentKnowledgeGapResult =
    currentDocumentId && knowledgeGapResults[currentDocumentId]
      ? knowledgeGapResults[currentDocumentId]
      : null;

  const handleKnowledgeGapResult = (result) => {
    if (!currentDocumentId) return;
    setKnowledgeGapResults((prev) => ({
      ...prev,
      [currentDocumentId]: result,
    }));
  };

  const heatmapCounts = {};
  if (currentChat && currentChat.length > 0) {
    currentChat.forEach((msg) => {
      if (
        msg.role === "bot" &&
        !msg.streaming &&
        Array.isArray(msg.sources)
      ) {
        const uniquePages = new Set();
        msg.sources.forEach((source) => {
          if (
            source.page &&
            source.document &&
            currentPdfName &&
            source.document.localeCompare(currentPdfName, undefined, {
              sensitivity: "accent",
            }) === 0
          ) {
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
    heatmapData[page] =
      heatmapCounts[page] >= 2
        ? heatmapCounts[page] / maxCount
        : 0;
  }

  return (
    <>
      <ToastConfig />
      <SearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        pdfs={pdfs}
        onSelectPdf={setSelectedPdf}
      />
      <FAB onUpload={handleUpload} />

      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          background: "var(--bg-primary)",
          transition: "background var(--transition-base)",
        }}
      >
        <Sidebar
          pdfs={pdfs}
          selectedPdf={selectedPdf}
          onSelectPdf={(id) => {
            setSelectedPdf(id);
            setPdfJumpTarget(null);
          }}
          onUpload={handleUpload}
          darkMode={darkMode}
        />

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
          }}
        >
          <Navbar
            darkMode={darkMode}
            setDarkMode={toggleTheme}
            onSearchToggle={() => setSearchOpen(true)}
          />

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            style={{
              flex: 1,
              padding: "16px 24px",
              overflow: "auto",
            }}
          >
            {pdfs.length > 0 ? (
              <div
                className="main-content-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.4fr 1fr",
                  gap: 20,
                  height: "100%",
                  minHeight: "calc(100vh - var(--topbar-height) - 32px)",
                }}
              >
                <div style={{ minHeight: 500, position: "relative" }}>
                  <PdfViewer
                    darkMode={darkMode}
                    currentPdfUrl={currentPdfUrl}
                    jumpTarget={pdfJumpTarget}
                    heatmapData={heatmapData}
                  />
                </div>
                <div style={{ minHeight: 500, position: "relative" }}>
                  <ChatPanel
                    darkMode={darkMode}
                    currentChat={currentChat}
                    selectedPdf={selectedPdf}
                    currentPdfName={currentPdfName}
                    currentPdfSessionId={currentPdfSessionId}
                    currentPdfSessionSecret={currentPdfSessionSecret}
                    currentDocumentId={currentDocumentId}
                    knowledgeGapResult={currentKnowledgeGapResult}
                    onKnowledgeGapResult={handleKnowledgeGapResult}
                    onAppendMessage={handleAppendMessage}
                    onOpenSource={handleOpenSource}
                    onUpdateLastBotMessage={handleUpdateLastBotMessage}
                    handleClearChat={handleClearChat}
                  />
                </div>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "calc(100vh - 120px)",
                  textAlign: "center",
                  padding: "40px",
                }}
              >
                <motion.div
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 3, repeat: Infinity }}
                  style={{
                    width: 100,
                    height: 100,
                    borderRadius: 28,
                    background: "var(--accent-gradient)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: 40,
                    marginBottom: 32,
                    boxShadow: "0 24px 64px rgba(99,102,241,0.2)",
                  }}
                >
                  <FiFileText />
                </motion.div>
                <h2
                  style={{
                    fontWeight: 700,
                    fontSize: 28,
                    color: "var(--text-primary)",
                    marginBottom: 12,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Welcome to PDF Intelligence
                </h2>
                <p
                  style={{
                    maxWidth: 420,
                    color: "var(--text-tertiary)",
                    fontSize: 15,
                    lineHeight: 1.7,
                    marginBottom: 32,
                  }}
                >
                  Upload a PDF document to get started. You can ask questions,
                  generate summaries, and explore knowledge gaps.
                </p>
                <div
                  style={{
                    padding: "16px 24px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-color)",
                    fontSize: 13,
                    color: "var(--text-tertiary)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <kbd
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      background: "var(--bg-tertiary)",
                      border: "1px solid var(--border-color)",
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    Cmd+K
                  </kbd>
                  <span>to search documents</span>
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/workspace" element={<MainApp />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/dashboard/*" element={<Dashboard />} />
            <Route path="/studyhub" element={<StudyHub />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
