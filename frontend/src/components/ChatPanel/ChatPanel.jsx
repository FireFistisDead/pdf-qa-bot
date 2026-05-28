import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiSend,
  FiTrash2,
  FiFileText,
  FiZap,
  FiBookOpen,
  FiMessageSquare,
  FiChevronDown,
} from "react-icons/fi";
import toast from "react-hot-toast";

import MessageBubble from "./MessageBubble";
import ExportMenu from "./ExportMenu";
import KnowledgeGapMap from "./KnowledgeGapMap";
import {
  askQuestionApi,
  askQuestionStreamApi,
  extractApiErrorMessage,
  summarizePdfApi,
  mapKnowledgeGapsApi,
} from "../../services/api";
import TypingIndicator from "../ui/TypingIndicator";

const MODE_OPTIONS = [
  { value: "default", label: "Standard", icon: "✨", tooltip: "Balanced answers grounded in your document." },
  { value: "tutor", label: "Tutor", icon: "📚", tooltip: "Answer + follow-up question to deepen understanding." },
  { value: "socratic", label: "Socratic", icon: "💭", tooltip: "Guides you through questions to find answers." },
  { value: "eli5", label: "Simple", icon: "🔤", tooltip: "Plain language, everyday analogies." },
  { value: "concise", label: "Concise", icon: "🎯", tooltip: "1-2 sentence answer, 60-word max." },
];

const ChatPanel = ({
  darkMode,
  currentChat,
  selectedPdf,
  currentPdfName,
  currentPdfSessionId,
  currentPdfSessionSecret,
  currentDocumentId,
  knowledgeGapResult,
  onKnowledgeGapResult,
  onUpdateLastBotMessage,
  onAppendMessage,
  onOpenSource,
  handleClearChat,
}) => {
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [mappingGaps, setMappingGaps] = useState(false);
  const [mode, setMode] = useState(() => {
    try {
      const saved = localStorage.getItem("pdfqa_preferred_mode");
      return MODE_OPTIONS.some((opt) => opt.value === saved) ? saved : "default";
    } catch {
      return "default";
    }
  });
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const chatContainerRef = useRef(null);

  const handleModeChange = useCallback((newMode) => {
    setMode(newMode);
    try {
      localStorage.setItem("pdfqa_preferred_mode", newMode);
    } catch {}
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [currentChat, asking]);

  const askQuestion = useCallback(async () => {
    if (!question.trim()) {
      toast.error("Please enter a question.");
      return;
    }
    if (!selectedPdf || !currentPdfSessionId || !currentPdfSessionSecret) {
      toast.error("Please upload and select a PDF first.");
      return;
    }

    const trimmedQuestion = question;
    setAsking(true);
    setQuestion("");

    const timestamp = new Date().toISOString();
    onAppendMessage({ role: "user", text: trimmedQuestion, timestamp });
    onAppendMessage({
      role: "bot",
      text: "",
      streaming: true,
      sources: [],
      mode,
      timestamp: new Date().toISOString(),
    });

    try {
      await askQuestionStreamApi(
        trimmedQuestion,
        currentPdfSessionId,
        currentPdfSessionSecret,
        mode,
        (partialText) => {
          onUpdateLastBotMessage(partialText, true);
        }
      );
      onUpdateLastBotMessage(null, false);
    } catch (streamErr) {
      console.warn("Streaming failed, falling back to /ask:", streamErr.message);
      try {
        const data = await askQuestionApi(
          trimmedQuestion,
          currentPdfSessionId,
          currentPdfSessionSecret,
          mode
        );
        onUpdateLastBotMessage(
          data.answer,
          false,
          data.sources || [],
          data.mode
        );
      } catch (e) {
        let errorMessage = "Error getting answer. Please try again.";
        if (e.code === "ECONNABORTED") {
          errorMessage = "Request timed out.";
        } else if (!e.response) {
          errorMessage = "Network error. Check if the backend is running.";
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
  }, [question, selectedPdf, currentPdfSessionId, currentPdfSessionSecret, mode, onAppendMessage, onUpdateLastBotMessage]);

  const summarizePDF = useCallback(async () => {
    if (!selectedPdf || !currentPdfSessionId || !currentPdfSessionSecret) {
      toast.error("Please upload and select a PDF first.");
      return;
    }
    setSummarizing(true);
    const loadingToast = toast.loading("Summarizing PDF...");
    try {
      const data = await summarizePdfApi(
        currentPdfName,
        currentPdfSessionId,
        currentPdfSessionSecret
      );
      onAppendMessage({
        role: "bot",
        text: data.summary,
        timestamp: new Date().toISOString(),
        mode: "default",
      });
      toast.success("Summarized successfully!", { id: loadingToast });
    } catch (e) {
      let errorMessage = "Error summarizing PDF.";
      if (e.code === "ECONNABORTED") {
        errorMessage = "Summarization timed out.";
      } else if (!e.response) {
        errorMessage = "Network error.";
      } else {
        errorMessage = extractApiErrorMessage(e, errorMessage);
      }
      toast.error(errorMessage, { id: loadingToast });
      onAppendMessage({ role: "bot", text: errorMessage });
    }
    setSummarizing(false);
  }, [selectedPdf, currentPdfSessionId, currentPdfSessionSecret, currentPdfName, onAppendMessage]);

  const mapKnowledgeGaps = useCallback(async () => {
    if (!selectedPdf || !currentPdfSessionId || !currentPdfSessionSecret) {
      toast.error("Please upload and select a PDF first.");
      return;
    }
    setMappingGaps(true);
    const loadingToast = toast.loading("Analysing knowledge prerequisites...");
    try {
      const data = await mapKnowledgeGapsApi(
        currentPdfSessionId,
        currentPdfSessionSecret,
        currentDocumentId || null
      );
      onKnowledgeGapResult?.(data);
      toast.success("Knowledge gap map ready!", { id: loadingToast });
    } catch (e) {
      let errorMessage = "Error mapping knowledge gaps.";
      if (e.code === "ECONNABORTED") {
        errorMessage = "Request timed out.";
      } else if (!e.response) {
        errorMessage = "Network error.";
      } else {
        errorMessage = extractApiErrorMessage(e, errorMessage);
      }
      toast.error(errorMessage, { id: loadingToast });
    }
    setMappingGaps(false);
  }, [selectedPdf, currentPdfSessionId, currentPdfSessionSecret, currentDocumentId, onKnowledgeGapResult]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      askQuestion();
    }
  }, [askQuestion]);

  const handleRegenerate = useCallback(() => {
    const lastUserMsg = [...currentChat].reverse().find((m) => m.role === "user");
    if (lastUserMsg) {
      setQuestion(lastUserMsg.text);
      toast("You can re-ask your question", { icon: "🔄" });
      inputRef.current?.focus();
    }
  }, [currentChat]);

  const hasActiveDoc = !!selectedPdf && !!currentPdfSessionId;
  const isEmpty = currentChat.length === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 600,
        background: "var(--bg-card)",
        border: "1px solid var(--border-color)",
        borderRadius: "var(--radius-xl)",
        backdropFilter: "blur(12px)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--border-color)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
          background: darkMode ? "rgba(15,23,42,0.2)" : "rgba(255,255,255,0.3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "var(--radius-md)",
              background: "var(--accent-gradient)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 16,
              boxShadow: "0 4px 12px rgba(99,102,241,0.25)",
            }}
          >
            <FiMessageSquare />
          </div>
          <div>
            <div
              style={{
                fontWeight: 600,
                fontSize: 14,
                color: "var(--text-primary)",
              }}
            >
              AI Assistant
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-tertiary)",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: hasActiveDoc ? "var(--success)" : "var(--warning)",
                  display: "inline-block",
                }}
              />
              {hasActiveDoc ? `Ready • ${currentPdfName || "PDF loaded"}` : "No document selected"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={summarizePDF}
            disabled={summarizing || !hasActiveDoc}
            title="Summarize PDF"
            aria-label="Summarize PDF"
            style={{
              padding: "8px 14px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-color)",
              background: summarizing ? "var(--bg-elevated)" : "transparent",
              color: "var(--text-secondary)",
              cursor: summarizing || !hasActiveDoc ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 500,
              opacity: summarizing || !hasActiveDoc ? 0.5 : 1,
              transition: "all var(--transition-fast)",
              fontFamily: "var(--font-sans)",
            }}
          >
            {summarizing ? (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    border: "2px solid var(--accent)",
                    borderTopColor: "transparent",
                    animation: "spin 0.6s linear infinite",
                    display: "inline-block",
                  }}
                />
                Analyzing...
              </span>
            ) : (
              <>
                <FiFileText size={13} />
                <span className="hide-on-mobile">Summarize</span>
              </>
            )}
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={mapKnowledgeGaps}
            disabled={mappingGaps || !hasActiveDoc}
            title="Map knowledge prerequisites"
            aria-label="Map knowledge gaps"
            style={{
              padding: "8px 14px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-color)",
              background: mappingGaps ? "var(--bg-elevated)" : "transparent",
              color: "var(--text-secondary)",
              cursor: mappingGaps || !hasActiveDoc ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 500,
              opacity: mappingGaps || !hasActiveDoc ? 0.5 : 1,
              transition: "all var(--transition-fast)",
              fontFamily: "var(--font-sans)",
            }}
          >
            {mappingGaps ? (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    border: "2px solid var(--accent-tertiary)",
                    borderTopColor: "transparent",
                    animation: "spin 0.6s linear infinite",
                    display: "inline-block",
                  }}
                />
                Analyzing...
              </span>
            ) : (
              <>
                <FiBookOpen size={13} />
                <span className="hide-on-mobile">Gaps</span>
              </>
            )}
          </motion.button>

          <ExportMenu currentChat={currentChat} selectedPdfName={currentPdfName} />

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleClearChat}
            disabled={isEmpty}
            title="Clear chat"
            aria-label="Clear chat history"
            style={{
              padding: 8,
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-color)",
              background: "transparent",
              color: "var(--text-tertiary)",
              cursor: isEmpty ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: isEmpty ? 0.4 : 1,
              transition: "all var(--transition-fast)",
            }}
          >
            <FiTrash2 size={14} />
          </motion.button>
        </div>
      </div>

      {/* Knowledge Gap Map */}
      <AnimatePresence>
        {knowledgeGapResult && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{ overflow: "hidden", borderBottom: "1px solid var(--border-color)" }}
          >
            <KnowledgeGapMap
              result={knowledgeGapResult}
              darkMode={darkMode}
              onOpenSource={onOpenSource}
              onDismiss={() => onKnowledgeGapResult?.(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Messages */}
      <div
        ref={chatContainerRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {isEmpty ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: "40px 20px",
            }}
          >
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              style={{
                width: 80,
                height: 80,
                borderRadius: 24,
                background: "var(--accent-gradient)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 32,
                marginBottom: 24,
                boxShadow: "0 16px 48px rgba(99,102,241,0.15)",
              }}
            >
              <FiMessageSquare />
            </motion.div>
            <h3
              style={{
                fontWeight: 700,
                fontSize: 22,
                color: "var(--text-primary)",
                marginBottom: 8,
                letterSpacing: "-0.02em",
              }}
            >
              AI Document Assistant
            </h3>
            <p
              style={{
                maxWidth: 360,
                color: "var(--text-tertiary)",
                fontSize: 14,
                lineHeight: 1.7,
                marginBottom: 0,
              }}
            >
              Upload a PDF and ask intelligent questions about its contents.
              Generate summaries, explore insights, and interact naturally.
            </p>
            {!hasActiveDoc && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                style={{
                  marginTop: 24,
                  padding: "14px 18px",
                  borderRadius: "var(--radius-md)",
                  background: "rgba(245,158,11,0.08)",
                  border: "1px solid rgba(245,158,11,0.15)",
                  fontSize: 13,
                  color: "var(--warning)",
                  fontWeight: 500,
                }}
              >
                Please upload a PDF to begin chatting.
              </motion.div>
            )}
          </motion.div>
        ) : (
          <>
            <AnimatePresence mode="popLayout">
              {currentChat.map((msg, i) => (
                <MessageBubble
                  key={`${msg.timestamp || i}-${i}`}
                  msg={msg}
                  darkMode={darkMode}
                  onOpenSource={onOpenSource}
                  onRegenerate={
                    msg.role === "bot" && !msg.streaming
                      ? handleRegenerate
                      : undefined
                  }
                  isLast={i === currentChat.length - 1}
                />
              ))}
            </AnimatePresence>
            {asking && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  padding: "12px 0",
                  color: "var(--text-tertiary)",
                  fontSize: 13,
                }}
                role="status"
                aria-label="AI is responding"
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "var(--bg-tertiary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--accent)",
                    fontSize: 12,
                  }}
                >
                  <FiZap />
                </div>
                <TypingIndicator />
                <span style={{ marginLeft: 4 }}>AI is analyzing document...</span>
              </motion.div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Mode Selector + Input */}
      <div
        style={{
          borderTop: "1px solid var(--border-color)",
          padding: "10px 16px 14px",
          flexShrink: 0,
          background: darkMode ? "rgba(15,23,42,0.15)" : "rgba(255,255,255,0.2)",
        }}
      >
        {/* Mode selector */}
        <div
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 8,
            flexWrap: "wrap",
          }}
        >
          {MODE_OPTIONS.map((opt) => (
            <motion.button
              key={opt.value}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => handleModeChange(opt.value)}
              title={opt.tooltip}
              aria-label={`Switch to ${opt.label} mode`}
              aria-pressed={mode === opt.value}
              style={{
                padding: "4px 10px",
                borderRadius: 20,
                border:
                  mode === opt.value
                    ? "1.5px solid var(--accent)"
                    : "1px solid var(--border-color)",
                background:
                  mode === opt.value
                    ? "rgba(99,102,241,0.1)"
                    : "transparent",
                color:
                  mode === opt.value
                    ? "var(--accent)"
                    : "var(--text-tertiary)",
                fontSize: 11,
                fontWeight: mode === opt.value ? 600 : 400,
                cursor: "pointer",
                transition: "all var(--transition-fast)",
                fontFamily: "var(--font-sans)",
                display: "flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              <span>{opt.icon}</span>
              <span>{opt.label}</span>
            </motion.button>
          ))}
        </div>

        {/* Input area */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 6px 4px 16px",
            borderRadius: "var(--radius-lg)",
            background: darkMode
              ? "rgba(30, 41, 59, 0.6)"
              : "rgba(241, 245, 249, 0.8)",
            border: "1px solid var(--border-color)",
            transition: "border-color var(--transition-fast), box-shadow var(--transition-fast)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--accent)";
            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.08)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border-color)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={asking}
            placeholder={
              hasActiveDoc
                ? "Ask a question about your PDF..."
                : "Upload a document to get started..."
            }
            aria-label="Ask a question"
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              color: "var(--text-primary)",
              fontSize: 14,
              outline: "none",
              padding: "10px 0",
              fontFamily: "var(--font-sans)",
            }}
          />

          <motion.button
            whileHover={!asking && question.trim() && hasActiveDoc ? { scale: 1.05 } : {}}
            whileTap={!asking && question.trim() && hasActiveDoc ? { scale: 0.93 } : {}}
            onClick={askQuestion}
            disabled={asking || !question.trim() || !hasActiveDoc}
            aria-label="Send message"
            style={{
              width: 42,
              height: 42,
              borderRadius: "var(--radius-md)",
              border: "none",
              background:
                asking || !question.trim() || !hasActiveDoc
                  ? "var(--bg-elevated)"
                  : "var(--accent-gradient)",
              color:
                asking || !question.trim() || !hasActiveDoc
                  ? "var(--text-tertiary)"
                  : "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor:
                asking || !question.trim() || !hasActiveDoc
                  ? "not-allowed"
                  : "pointer",
              flexShrink: 0,
              boxShadow:
                asking || !question.trim() || !hasActiveDoc
                  ? "none"
                  : "0 8px 24px rgba(99,102,241,0.25)",
              transition: "all var(--transition-fast)",
              fontSize: 17,
            }}
          >
            {asking ? (
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  border: "2px solid currentColor",
                  borderTopColor: "transparent",
                  animation: "spin 0.6s linear infinite",
                  display: "block",
                }}
              />
            ) : (
              <FiSend />
            )}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
};

export default ChatPanel;
