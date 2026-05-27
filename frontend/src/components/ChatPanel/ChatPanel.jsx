import React, { useEffect, useRef, useState } from "react";
import { Card, Button, Form, Spinner } from "react-bootstrap";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import toast from "react-hot-toast";

import MessageBubble from "./MessageBubble";
import ExportMenu from "./ExportMenu";
import { askQuestionApi, askQuestionStreamApi, extractApiErrorMessage, summarizePdfApi } from "../../services/api";

const MODE_OPTIONS = [
  { value: "default",  label: "Standard",  tooltip: "Balanced answers grounded in your document. Best for general-purpose reading." },
  { value: "tutor",    label: "Tutor",     tooltip: "Full answer + one thoughtful follow-up question to push your understanding further." },
  { value: "socratic", label: "Socratic",  tooltip: "Guides you to the answer through 2–3 questions. Never reveals the answer directly." },
  { value: "eli5",     label: "Simple",    tooltip: "Plain language, everyday analogies, no jargon. Best for dense academic or legal documents." },
  { value: "concise",  label: "Concise",   tooltip: "1–2 sentence answer, 60-word maximum. Best for quick fact-checking." },
];

const ChatPanel = ({
  darkMode,
  currentChat,
  selectedPdf,
  currentPdfName,
  currentPdfSessionId,
  currentPdfSessionSecret,
  onUpdateLastBotMessage,
  onAppendMessage,
  onOpenSource,
  handleClearChat,
  onSaveAnswer,
}) => {
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [mode, setMode] = useState(() => {
    const saved = localStorage.getItem("pdfqa_preferred_mode");
    return MODE_OPTIONS.some(opt => opt.value === saved) ? saved : "default";
  });
  const messagesEndRef = useRef(null);

  const handleModeChange = (newMode) => {
    setMode(newMode);
    localStorage.setItem("pdfqa_preferred_mode", newMode);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [currentChat, asking]);
const askQuestion = async () => {
  if (!question.trim()) {
    toast.error("Please enter a question before submitting.");
    return;
  }
  if (!selectedPdf || !currentPdfSessionId || !currentPdfSessionSecret) {
    toast.error("Please upload and select a PDF document first.");
    return;
  }

  const trimmedQuestion = question;
  setAsking(true);
  setQuestion("");
  onAppendMessage({ role: "user", text: trimmedQuestion });
  onAppendMessage({ role: "bot", text: "", streaming: true, sources: [], mode });

  try {
    await askQuestionStreamApi(trimmedQuestion, currentPdfSessionId, currentPdfSessionSecret, mode, (partialText) => {
      onUpdateLastBotMessage(partialText, true);
    });
    onUpdateLastBotMessage(null, false);
  } catch (streamErr) {
    console.warn("Streaming failed, falling back to /ask:", streamErr.message);
    try {
      const data = await askQuestionApi(trimmedQuestion, currentPdfSessionId, currentPdfSessionSecret, mode);
      onUpdateLastBotMessage(data.answer, false, data.sources || [], data.mode);
    } catch (e) {
      let errorMessage = "Error getting answer. Please try again.";
      if (e.code === "ECONNABORTED") {
        errorMessage = "Request timed out. Please try a simpler question.";
      } else if (!e.response) {
        errorMessage = "Network error. Please check if the backend server is running.";
      } else if (e.response?.status === 404) {
        errorMessage = "Session not found. Please upload the PDF again.";
      } else if (e.response?.status === 500) {
        errorMessage = "Server error. Please try again later.";
      } else {
        errorMessage = extractApiErrorMessage(e, errorMessage);
      }
      toast.error(errorMessage);
      onUpdateLastBotMessage(errorMessage, false);
    }
  }
  setAsking(false);
};

  const summarizePDF = async () => {
    if (!selectedPdf || !currentPdfSessionId || !currentPdfSessionSecret) {
      toast.error("Please upload and select a PDF document first.");
      return;
    }

    setSummarizing(true);
    const loadingToast = toast.loading("Summarizing PDF...");

    try {
      const data = await summarizePdfApi(currentPdfName, currentPdfSessionId, currentPdfSessionSecret);
      onAppendMessage({ role: "bot", text: data.summary });
      toast.success("PDF summarized successfully!", {
        id: loadingToast,
      });
    } catch (e) {
      let errorMessage = "Error summarizing PDF. Please try again.";

      if (e.code === "ECONNABORTED") {
        errorMessage =
          "Summarization timed out. The document might be too large. Please try again.";
      } else if (!e.response) {
        errorMessage =
          "Network error. Please check if the backend server is running.";
      } else if (e.response?.status === 404) {
        errorMessage = "Session not found. Please upload the PDF again.";
      } else if (e.response?.status === 500) {
        errorMessage = "Server error. Please try again later.";
      } else {
        errorMessage = extractApiErrorMessage(e, errorMessage);
      }

      toast.error(errorMessage, {
        id: loadingToast,
      });
      onAppendMessage({ role: "bot", text: errorMessage });
    }
    setSummarizing(false);
  };

  return (
    <Card
      className={`glass-card ${
        darkMode ? "bg-dark text-light border-secondary" : ""
      }`}
      style={{
        borderRadius: "24px",
        minHeight: "650px",
        border: darkMode
          ? "1px solid rgba(255,255,255,0.08)"
          : "1px solid rgba(0,0,0,0.08)",
      }}
    >
      <Card.Body className="d-flex flex-column">
        {/* HEADER */}
        <div
          className="d-flex justify-content-between align-items-center mb-4 pb-3"
          style={{
            borderBottom: darkMode
              ? "1px solid rgba(255,255,255,0.06)"
              : "1px solid rgba(0,0,0,0.06)",
          }}
        >
          <div>
            <div className="d-flex align-items-center gap-2">
              <h5 className="mb-0">AI Assistant</h5>

              <div
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#22C55E",
                }}
              />
            </div>

            <small
              style={{
                color: darkMode ? "#A1A1AA" : "#666",
              }}
            >
              Ready to assist with your document
            </small>
          </div>
          <div className="d-flex gap-2">
            <Button
              variant="warning"
              size="sm"
              onClick={summarizePDF}
              disabled={summarizing || !selectedPdf}
            >
              {summarizing ? (
                <Spinner animation="border" size="sm" />
              ) : (
                "Summarize"
              )}
            </Button>

            <ExportMenu currentChat={currentChat} selectedPdfName={currentPdfName} />
            <Button
            variant="danger"
            size="sm"
            onClick={handleClearChat}>
            Clear Chat
            </Button>
          </div>
        </div>

        {/* CHAT AREA */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            marginBottom: 20,
            paddingRight: "6px",
          }}
        >
          {currentChat.length > 0 ? (
            <>
              <div className="d-flex justify-content-start mb-4">
                <div
                  className={`p-3 ${darkMode ? "text-light" : "text-dark"}`}
                  style={{
                    maxWidth: "85%",
                    borderRadius: "20px 20px 20px 6px",

                    background: darkMode
                      ? "rgba(255,255,255,0.05)"
                      : "#F8FAFC",

                    border: darkMode
                      ? "1px solid rgba(255,255,255,0.06)"
                      : "1px solid rgba(0,0,0,0.06)",

                    lineHeight: 1.8,
                    fontSize: "15px",
                  }}
                >
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <SmartToyIcon
                      sx={{
                        fontSize: 20,
                        color: "#8B5CF6",
                      }}
                    />

                    <strong>PDF Intelligence</strong>
                  </div>

                  <div>
                    Hi! I am your document assistant.
                    <br />
                    <br />
                    Upload a PDF and ask me anything about it. I can:
                    <ul style={{ marginTop: "10px" }}>
                      <li>Summarize complex sections</li>
                      <li>Find important information</li>
                      <li>Explain technical concepts</li>
                    </ul>
                  </div>
                </div>
              </div>
              {currentChat.map((msg, i) => (
                <MessageBubble
                  key={i}
                  msg={msg}
                  darkMode={darkMode}
                  onOpenSource={onOpenSource}
                  onSaveAnswer={onSaveAnswer}
                />
              ))}

              {asking && (
                <div className="d-flex justify-content-start mb-3 chat-message">
                  <div
                    className={`p-3 ${darkMode ? "text-light" : "text-dark"}`}
                    style={{
                      maxWidth: "220px",
                      borderRadius: "20px 20px 20px 6px",

                      background: darkMode
                        ? "rgba(255,255,255,0.06)"
                        : "#F3F4F6",

                      border: darkMode
                        ? "1px solid rgba(255,255,255,0.06)"
                        : "1px solid rgba(0,0,0,0.06)",

                      backdropFilter: "blur(12px)",
                    }}
                  >
                    <div className="d-flex align-items-center gap-2">
                      <SmartToyIcon
                        sx={{
                          fontSize: 20,
                          color: "#8B5CF6",
                        }}
                      />

                      <div className="d-flex align-items-center gap-1">
                        <span className="typing-dot"></span>
                        <span className="typing-dot"></span>
                        <span className="typing-dot"></span>
                      </div>

                      <span
                        style={{
                          fontSize: "14px",
                          opacity: 0.85,
                        }}
                      >
                        AI is analyzing document...
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div
              className="d-flex flex-column justify-content-center align-items-center text-center"
              style={{
                minHeight: "520px",
                padding: "40px",
              }}
            >
              <div
                style={{
                  width: "88px",
                  height: "88px",
                  borderRadius: "24px",
                  background: darkMode
                    ? "rgba(124,77,255,0.12)"
                    : "rgba(124,77,255,0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "24px",
                }}
              >
                <SmartToyIcon
                  sx={{
                    fontSize: 48,
                    color: "#8B5CF6",
                  }}
                />
              </div>

              <h3
                style={{
                  fontWeight: 700,
                  marginBottom: "12px",
                  fontSize: "38px",
                  letterSpacing: "-0.5px",
                }}
              >
                Your AI Document Assistant
              </h3>

              <p
                style={{
                  maxWidth: "360px",
                  color: darkMode ? "#A1A1AA" : "#666",
                  lineHeight: 1.7,
                  marginBottom: 0,
                }}
              >
                Upload a document and ask intelligent questions about its
                contents. Generate summaries, explore insights, and interact
                naturally with your PDF files.
              </p>
              <div
                style={{
                  marginTop: "28px",
                  width: "100%",
                  maxWidth: "520px",

                  padding: "18px 20px",

                  borderRadius: "22px",

                  background: darkMode
                    ? "rgba(245,158,11,0.12)"
                    : "rgba(245,158,11,0.08)",

                  border: darkMode
                    ? "1px solid rgba(245,158,11,0.22)"
                    : "1px solid rgba(245,158,11,0.18)",

                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    marginBottom: "4px",
                    color: "#F59E0B",
                  }}
                >
                  Waiting for document
                </div>

                <div
                  style={{
                    fontSize: "14px",
                    color: darkMode ? "#D1D5DB" : "#92400E",
                    lineHeight: 1.6,
                  }}
                >
                  Please upload a PDF document first to begin the conversation.
                </div>
              </div>
            </div>
          )}
        </div>
        <div ref={messagesEndRef} />
        {/* MODE SELECTOR */}
        <div style={{ marginBottom: "10px" }}>
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                id={`mode-btn-${opt.value}`}
                title={opt.tooltip}
                onClick={() => handleModeChange(opt.value)}
                style={{
                  padding: "4px 12px",
                  borderRadius: "20px",
                  border: mode === opt.value
                    ? "1.5px solid #8B5CF6"
                    : darkMode ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(0,0,0,0.12)",
                  background: mode === opt.value
                    ? "rgba(139,92,246,0.15)"
                    : "transparent",
                  color: mode === opt.value
                    ? "#8B5CF6"
                    : darkMode ? "#A1A1AA" : "#666",
                  fontSize: "12px",
                  fontWeight: mode === opt.value ? 600 : 400,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: "11px", color: darkMode ? "#6B7280" : "#9CA3AF", marginTop: "4px" }}>
            {MODE_OPTIONS.find(o => o.value === mode)?.tooltip}
          </div>
        </div>
        {/* INPUT */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",

            padding: "10px 12px",

            borderRadius: "18px",

            background: darkMode
              ? "rgba(255,255,255,0.07)"
              : "#F8FAFC",

            border: darkMode
              ? "1px solid rgba(255,255,255,0.08)"
              : "1px solid rgba(0,0,0,0.06)",

            backdropFilter: "blur(12px)",
          }}
        >
          <Form.Control
            className={darkMode ? "custom-chat-input" : "light-placeholder"}
            type="text"
            placeholder="Ask a question about your PDF..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={asking}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                askQuestion();
              }
            }}
            style={{
              border: "none",
              background: "transparent",
              boxShadow: "none",
              color: darkMode ? "#fff" : "#111",
              caretColor: darkMode ? "#fff" : "#111",
              fontSize: "15px",
              opacity: 1,
              WebkitTextFillColor: darkMode ? "#fff" : "#111",
            }}
          />

          <Button
            variant="primary"
            onClick={askQuestion}
            disabled={asking || !question.trim() || !selectedPdf}
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "14px",
              border: "none",

              background: "linear-gradient(135deg, #8B5CF6, #7C4DFF)",

              display: "flex",
              alignItems: "center",
              justifyContent: "center",

              flexShrink: 0,

              boxShadow: "0 8px 24px rgba(124,77,255,0.25)",
            }}
          >
            {asking ? <Spinner animation="border" size="sm" /> : "➜"}
          </Button>
        </div>
      </Card.Body>
    </Card>
  );
};

export default ChatPanel;

// Accessibility improvements applied
