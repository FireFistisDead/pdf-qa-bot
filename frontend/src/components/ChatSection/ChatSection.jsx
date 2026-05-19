import React, {
  useEffect,
  useRef,
} from "react";
import {
  Card,
  Button,
  Form,
  Spinner,
} from "react-bootstrap";

import ReactMarkdown from "react-markdown";
import SmartToyIcon from "@mui/icons-material/SmartToy";

const ChatSection = ({
  darkMode,
  currentChat,
  question,
  setQuestion,
  askQuestion,
  asking,
  summarizePDF,
  summarizing,
  selectedPdf,
  exportChat,
}) => {
    const messagesEndRef = useRef(null);

useEffect(() => {
  messagesEndRef.current?.scrollIntoView({
    behavior: "smooth",
  });
}, [currentChat, asking]);
  return (
    <Card
      className={`glass-card ${
  darkMode
    ? "bg-dark text-light border-secondary"
    : ""
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

            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => exportChat("pdf")}
              disabled={!selectedPdf}
            >
              Export
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
    className={`p-3 ${
      darkMode ? "text-light" : "text-dark"
    }`}
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
      Upload a PDF and ask me anything about it.
      I can:
      <ul style={{ marginTop: "10px" }}>
        <li>Summarize complex sections</li>
        <li>Find important information</li>
        <li>Explain technical concepts</li>
      </ul>
    </div>
  </div>
</div>
    {currentChat.map((msg, i) => (
      <div
        key={i}
        className={`d-flex ${
  msg.role === "user"
    ? "justify-content-end"
    : "justify-content-start"
} mb-3 chat-message`}
      >
        <div
          className={`p-3 ${
            msg.role === "user"
              ? "text-light"
              : darkMode
              ? "text-light"
              : "text-dark"
          }`}
          style={{
            maxWidth: "85%",
            borderRadius:
              msg.role === "user"
                ? "20px 20px 6px 20px"
                : "20px 20px 20px 6px",

            background:
              msg.role === "user"
                ? "linear-gradient(135deg, #8B5CF6, #7C4DFF)"
                : darkMode
                ? "rgba(255,255,255,0.08)"
                : "#F3F4F6",

            border:
              msg.role === "bot"
                ? darkMode
                  ? "1px solid rgba(255,255,255,0.06)"
                  : "1px solid rgba(0,0,0,0.06)"
                : "none",

            boxShadow:
              msg.role === "user"
                ? "0 8px 24px rgba(124,77,255,0.25)"
                : "none",

            backdropFilter: "blur(12px)",
            lineHeight: 1.7,
            fontSize: "15px",
            padding: "14px 16px",
          }}
        >
          {msg.role === "bot" ? (
            <ReactMarkdown>{msg.text}</ReactMarkdown>
          ) : (
            <span>{msg.text}</span>
          )}
        </div>
      </div>
    ))}

    {asking && (
      <div className="d-flex justify-content-start mb-3 chat-message">
        <div
          className={`p-3 ${
            darkMode ? "text-light" : "text-dark"
          }`}
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
      Upload a document and ask intelligent questions
      about its contents. Generate summaries, explore
      insights, and interact naturally with your PDF files.
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
    Please upload a PDF document first to begin
    the conversation.
  </div>
</div>
  </div>
)}
</div>
<div ref={messagesEndRef} />
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
  className={
  darkMode
    ? "custom-chat-input"
    : "light-placeholder"
}
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
    disabled={
      asking ||
      !question.trim() ||
      !selectedPdf
    }
    style={{
      width: "48px",
      height: "48px",
      borderRadius: "14px",
      border: "none",

      background:
        "linear-gradient(135deg, #8B5CF6, #7C4DFF)",

      display: "flex",
      alignItems: "center",
      justifyContent: "center",

      flexShrink: 0,

      boxShadow:
        "0 8px 24px rgba(124,77,255,0.25)",
    }}
  >
    {asking ? (
      <Spinner
        animation="border"
        size="sm"
      />
    ) : (
      "➜"
    )}
  </Button>
</div>
      </Card.Body>
    </Card>
  );
};

export default ChatSection;