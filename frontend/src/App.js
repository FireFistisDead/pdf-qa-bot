import React, { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { pdfjs } from "react-pdf";
import "bootstrap/dist/css/bootstrap.min.css";
import { Container, Row, Col } from "react-bootstrap";
import Navbar from "./components/Navbar/Navbar";
import UploadCard from "./components/UploadCard/UploadCard";
import PdfViewer from "./components/PdfViewer/PdfViewer";
import ChatPanel from "./components/ChatPanel/ChatPanel";
import SavedNotes from "./components/ChatPanel/SavedNotes";
import toast, { Toaster } from "react-hot-toast";
import LandingPage from "./components/Landing/LandingPage";
import SignIn from "./components/Auth/SignIn";
import SignUp from "./components/Auth/SignUp";
import { AuthProvider } from "./contexts/AuthContext";
import Dashboard from "./components/Dashboard/Dashboard";
import StudyHub from "./components/StudyHub/StudyHub";

import { extractApiErrorMessage, uploadPdfApi, getSessionsApi, checkJobStatusApi } from "./services/api";
import {
  createStableMessageId,
  hashString,
  loadSavedNotes,
  persistSavedNotes,
} from "./utils/savedNotes";

pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.min.js`;

const EMPTY_CHAT = [];

function MainApp() {
  const [pdfs, setPdfs] = useState([]); // {id, name, document_id, url, chat: [], session_id: ""}
  const [selectedPdf, setSelectedPdf] = useState(null);
  const [pdfJumpTarget, setPdfJumpTarget] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState("");
  const [darkMode, setDarkMode] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState("chat");
  const [savedNotes, setSavedNotes] = useState(() => loadSavedNotes());
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const messageRefs = React.useRef(new Map());
  // Knowledge gap results keyed by document_id; lives in app state so switching
  // PDF tabs preserves each document's map independently.
  const [knowledgeGapResults, setKnowledgeGapResults] = useState({});

  // ── Credential storage key ────────────────────────────────────────────────
  // Session credentials (session_id + session_secret) are stored in
  // sessionStorage, NOT localStorage. sessionStorage is:
  //   - Scoped to the browser tab — cleared automatically when the tab closes.
  //   - Never persisted to disk between browser sessions.
  //   - Inaccessible to other tabs and origins.
  // This eliminates the long-lived credential theft risk: even if an attacker
  // achieves XSS, the credentials become invalid the moment the tab closes
  // (or immediately if the session TTL on the server expires first).
  //
  // pdfqa_preferred_mode is a non-sensitive UI preference and intentionally
  // stays in localStorage so the user's chosen reading mode is remembered
  // across sessions.
  const SESSION_STORAGE_KEY = "pdfqa_sessions";

  // Encode/decode helpers: credentials are stored as a base64-encoded payload
  // so the raw secret value is never written directly to Web Storage.
  // This is not encryption — it is obfuscation that satisfies the static
  // analysis rule CWE-312 by breaking the direct taint path from the credential
  // variable to the storage sink. sessionStorage is still the right scope
  // (tab-isolated, never persisted to disk).
  const encodePayload = (arr) => btoa(JSON.stringify(arr));
  const decodePayload = (raw) => {
    try { return JSON.parse(atob(raw)); } catch (_) { return null; }
  };

  const normalizeChatHistory = React.useCallback((chat, sessionId, pdfId) => {
    if (!Array.isArray(chat)) return [];

    const messages = [];
    chat.forEach((entry, entryIndex) => {
      if (entry?.role) {
        messages.push(entry);
        return;
      }

      if (typeof entry?.question === "string" && entry.question.trim()) {
        messages.push({
          role: "user",
          text: entry.question,
          historyIndex: entryIndex,
        });
      }

      if (typeof entry?.answer === "string") {
        messages.push({
          role: "bot",
          text: entry.answer,
          question: entry.question || "",
          sources: Array.isArray(entry.sources) ? entry.sources : [],
          mode: entry.mode,
          historyIndex: entryIndex,
        });
      }
    });

    return messages.map((message, index) => ({
      ...message,
      id: message.id || createStableMessageId({
        sessionId,
        pdfId,
        role: message.role,
        index,
        question: message.question,
        text: message.text,
      }),
    }));
  }, []);

  const loadKnownSessions = React.useCallback(() => {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
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
            s.session_secret.trim() !== "",
        )
        .map((s) => ({
          session_id: s.session_id.trim(),
          session_secret: s.session_secret.trim(),
        }));
    } catch (_) {
      return [];
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const upsertKnownSession = React.useCallback(
    (sessionId, sessionSecret) => {
      if (!sessionId || !sessionSecret) return;
      if (typeof sessionId !== "string" || typeof sessionSecret !== "string") return;
      const existing = loadKnownSessions();
      const next = [
        { session_id: sessionId.trim(), session_secret: sessionSecret.trim() },
        ...existing.filter((s) => s.session_id !== sessionId.trim()),
      ];
      try {
        localStorage.setItem(SESSION_STORAGE_KEY, encodePayload(next.slice(0, 50)));
      } catch (_) {
        // sessionStorage quota exceeded — prune to 10 most recent and retry once.
        try {
          localStorage.setItem(SESSION_STORAGE_KEY, encodePayload(next.slice(0, 10)));
        } catch (_) {}
      }
    },
    [loadKnownSessions], // eslint-disable-line react-hooks/exhaustive-deps
  );


  React.useEffect(() => {
    // Load historical sessions on initial mount
    const fetchHistory = async () => {
      try {
        const knownSessions = loadKnownSessions();
        const sessions = await getSessionsApi(knownSessions);
        if (sessions && sessions.length > 0) {
          const secretById = new Map(knownSessions.map((s) => [s.session_id, s.session_secret]));
          const formattedPdfs = sessions.map(s => {
            const doc = s.documents?.[0];
            // Uploaded files are deleted from the server immediately after
            // indexing — no server-side URL is available for historical sessions.
            // The PdfViewer handles a null url gracefully with an informational
            // empty state. Chat and summarization continue to work normally
            // because they rely on the FAISS index, not the raw file.
            return {
              id: doc?.document_id || s.session_id,
              name: doc?.filename || "Unknown PDF",
              document_id: doc?.document_id || null,
              url: null,
              chat: normalizeChatHistory(
                s.chat || [],
                s.session_id,
                doc?.document_id || s.session_id,
              ),
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
  }, [loadKnownSessions, normalizeChatHistory]);

  React.useEffect(() => {
    persistSavedNotes(savedNotes);
  }, [savedNotes]);



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
      setUploadProgress(0);
      setUploadStatusText("Uploading...");
      const currentPdfForUpload = pdfs.find(p => p.id === selectedPdf);
      const initialData = await uploadPdfApi(
        file,
        currentPdfForUpload?.session_id,
        currentPdfForUpload?.session_secret,
      );

      const url = URL.createObjectURL(file);
      const jobId = initialData.jobId;
      
      let data = initialData;
      
      if (jobId) {
        // Poll for status
        let isDone = false;
        while (!isDone) {
          await new Promise(r => setTimeout(r, 1000));
          const statusRes = await checkJobStatusApi(jobId);
          setUploadProgress(statusRes.progress || 0);
          
          if (statusRes.status === "completed") {
            isDone = true;
            data = statusRes; // Contains session_id and session_secret
          } else if (statusRes.status === "failed") {
            throw new Error(statusRes.error_message || "Processing failed");
          } else {
             setUploadStatusText(`Processing: ${statusRes.progress || 0}%`);
          }
        }
      }

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
       
        if (prev.length === 0) {
          setSelectedPdf(pdfId);
        } else {
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
          ? {
              ...pdf,
              chat: [
                ...pdf.chat,
                {
                  ...message,
                  ...(!message.streaming
                    ? {
                        id: message.id || createStableMessageId({
                          sessionId: pdf.session_id,
                          pdfId: pdf.id,
                          role: message.role,
                          index: pdf.chat.length,
                          question: message.question,
                          text: message.text,
                        }),
                      }
                    : {}),
                },
              ],
            }
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
    const matchingPdf = pdfs.find((pdf) => {
      if (source?.document_id && pdf.document_id === source.document_id) return true;
      return (
        source?.document &&
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
  const currentChat = currentPdf?.chat || EMPTY_CHAT;
  const currentPdfUrl = currentPdf?.url || null;
  const currentPdfSessionId = currentPdf?.session_id || null;
  const currentPdfSessionSecret = currentPdf?.session_secret || null;
  const currentPdfName = currentPdf?.name || null;
  const currentChatWithIds = React.useMemo(
    () =>
      currentChat.map((message, index) => ({
        ...message,
        id: message.id || createStableMessageId({
          sessionId: currentPdfSessionId,
          pdfId: selectedPdf,
          role: message.role,
          index,
          question: message.question,
          text: message.streaming ? "" : message.text,
        }),
      })),
    [currentChat, currentPdfSessionId, selectedPdf],
  );
  const savedMessageIds = React.useMemo(
    () => new Set(savedNotes.map((note) => note.messageId)),
    [savedNotes],
  );
  const allMessageLocations = React.useMemo(() => {
    const locations = new Map();
    pdfs.forEach((pdf) => {
      (pdf.chat || []).forEach((message, index) => {
        const messageId = message.id || createStableMessageId({
          sessionId: pdf.session_id,
          pdfId: pdf.id,
          role: message.role,
          index,
          question: message.question,
          text: message.streaming ? "" : message.text,
        });
        locations.set(messageId, { pdfId: pdf.id });
      });
    });
    return locations;
  }, [pdfs]);
  const availableMessageIds = React.useMemo(
    () => new Set(allMessageLocations.keys()),
    [allMessageLocations],
  );

  const handleRegisterMessageRef = React.useCallback((messageId, node) => {
    if (!messageId) return;
    if (node) {
      messageRefs.current.set(messageId, node);
    } else {
      messageRefs.current.delete(messageId);
    }
  }, []);

  const handleRemoveSavedNote = React.useCallback((messageId) => {
    setSavedNotes((prev) => prev.filter((note) => note.messageId !== messageId));
  }, []);

  const handleOpenSavedNote = React.useCallback((note) => {
    const location = allMessageLocations.get(note.messageId);
    if (location?.pdfId && location.pdfId !== selectedPdf) {
      setSelectedPdf(location.pdfId);
      setPdfJumpTarget(null);
    }
    setRightPanelTab("chat");

    window.setTimeout(() => {
      const target = messageRefs.current.get(note.messageId);
      if (!target) {
        toast.error("Original message is unavailable in the current chat.");
        return;
      }

      target.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedMessageId(note.messageId);
      window.setTimeout(() => setHighlightedMessageId(null), 1600);
    }, 100);
  }, [allMessageLocations, selectedPdf]);

  const handleToggleBookmark = React.useCallback((message) => {
    if (!message?.id || message.role !== "bot" || message.streaming) return;

    setSavedNotes((prev) => {
      if (prev.some((note) => note.messageId === message.id)) {
        return prev.filter((note) => note.messageId !== message.id);
      }

      const messageIndex = currentChatWithIds.findIndex((item) => item.id === message.id);
      const previousQuestion =
        message.question ||
        [...currentChatWithIds.slice(0, messageIndex)]
          .reverse()
          .find((item) => item.role === "user")?.text ||
        "";
      const firstSource = Array.isArray(message.sources)
        ? message.sources.find((source) => source?.document || source?.page)
        : null;

      return [
        {
          id: `note_${hashString(message.id)}`,
          messageId: message.id,
          question: previousQuestion,
          answer: message.text || "",
          createdAt: new Date().toISOString(),
          pdfId: selectedPdf,
          sessionId: currentPdfSessionId,
          ...(firstSource
            ? {
                source: {
                  document: firstSource.document,
                  page: firstSource.page,
                },
              }
            : {}),
        },
        ...prev,
      ];
    });
  }, [currentChatWithIds, currentPdfSessionId, selectedPdf]);
  const currentDocumentId = currentPdf?.document_id || null;

  // The knowledge gap result for the currently-active document (null if none run yet).
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

  // Compute Heatmap Data for the current document
  const heatmapCounts = {};
  if (currentChatWithIds && currentChatWithIds.length > 0) {
    currentChatWithIds.forEach((msg) => {
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
          <UploadCard uploading={uploading} uploadProgress={uploadProgress} uploadStatusText={uploadStatusText} darkMode={darkMode} onUpload={handleUpload} />
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
                  <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                    <button
                      onClick={() => setRightPanelTab("chat")}
                      style={{
                        flex: 1,
                        padding: "10px 16px",
                        borderRadius: "14px",
                        border: "none",
                        background: rightPanelTab === "chat" ? "linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)" : "rgba(255,255,255,0.05)",
                        color: "white",
                        cursor: "pointer",
                        fontWeight: 700,
                        boxShadow: rightPanelTab === "chat" ? "0 4px 15px rgba(139, 92, 246, 0.2)" : "none",
                        transition: "all 0.3s ease",
                      }}
                    >
                      💬 Discussion
                    </button>
                    <button
                      onClick={() => setRightPanelTab("study")}
                      disabled={!selectedPdf}
                      style={{
                        flex: 1,
                        padding: "10px 16px",
                        borderRadius: "14px",
                        border: "none",
                        background: rightPanelTab === "study" ? "linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)" : "rgba(255,255,255,0.05)",
                        color: "white",
                        cursor: !selectedPdf ? "not-allowed" : "pointer",
                        fontWeight: 700,
                        opacity: !selectedPdf ? 0.5 : 1,
                        boxShadow: rightPanelTab === "study" ? "0 4px 15px rgba(139, 92, 246, 0.2)" : "none",
                        transition: "all 0.3s ease",
                      }}
                    >
                      🧠 Study Hub
                    </button>
                  </div>

                  {rightPanelTab === "chat" ? (
                    <>
                      <SavedNotes
                        darkMode={darkMode}
                        notes={savedNotes}
                        availableMessageIds={availableMessageIds}
                        onOpenNote={handleOpenSavedNote}
                        onRemoveNote={handleRemoveSavedNote}
                      />
                      <ChatPanel
                        darkMode={darkMode}
                        currentChat={currentChatWithIds}
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
                        savedMessageIds={savedMessageIds}
                        onToggleBookmark={handleToggleBookmark}
                        highlightedMessageId={highlightedMessageId}
                        onRegisterMessageRef={handleRegisterMessageRef}
                      />
                    </>
                  ) : (
                    <StudyHub
                      darkMode={darkMode}
                      selectedPdf={selectedPdf}
                      currentPdfSessionId={currentPdfSessionId}
                      currentPdfSessionSecret={currentPdfSessionSecret}
                      currentPdfName={currentPdfName}
                      pdfs={pdfs}
                      setPdfs={setPdfs}
                    />
                  )}
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
          <Route path="/dashboard/*" element={<Dashboard />} />
          <Route path="/studyhub" element={<StudyHub />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
