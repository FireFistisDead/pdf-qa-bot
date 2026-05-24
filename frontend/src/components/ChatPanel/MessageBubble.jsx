import React from "react";
import ReactMarkdown from "react-markdown";

const MODE_BADGE = {
  default:  { label: "Standard",  bg: "rgba(107,114,128,0.15)", color: "#6B7280" },
  tutor:    { label: "Tutor",     bg: "rgba(59,130,246,0.15)",  color: "#3B82F6" },
  socratic: { label: "Socratic",  bg: "rgba(139,92,246,0.15)", color: "#8B5CF6" },
  eli5:     { label: "Simple",    bg: "rgba(34,197,94,0.15)",  color: "#22C55E" },
  concise:  { label: "Concise",   bg: "rgba(249,115,22,0.15)", color: "#F97316" },
};

const MessageBubble = ({ msg, darkMode }) => {
  return (
    <div
      className={`d-flex ${
        msg.role === "user" ? "justify-content-end" : "justify-content-start"
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
            msg.role === "user" ? "20px 20px 6px 20px" : "20px 20px 20px 6px",

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
            msg.role === "user" ? "0 8px 24px rgba(124,77,255,0.25)" : "none",

          backdropFilter: "blur(12px)",
          lineHeight: 1.7,
          fontSize: "15px",
          padding: "14px 16px",
        }}
      >
        {msg.role === "bot" ? (
          <span>
            <ReactMarkdown>{msg.text}</ReactMarkdown>
            {msg.streaming && (
              <span style={{
                display: "inline-block", width: "2px", height: "1em",
                background: "currentColor", marginLeft: "2px",
                verticalAlign: "text-bottom",
                animation: "blink-cursor 0.8s step-end infinite",
              }} />
            )}
          </span>
        ) : (
          <span>{msg.text}</span>
        )}

        {msg.role === "bot" && msg.mode && msg.mode !== "default" && (() => {
          const badge = MODE_BADGE[msg.mode] || MODE_BADGE.default;
          return (
            <div style={{ marginTop: "8px" }}>
              <span style={{
                fontSize: "0.7rem",
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: "10px",
                background: badge.bg,
                color: badge.color,
                letterSpacing: "0.02em",
              }}>
                {badge.label}
              </span>
            </div>
          );
        })()}

        {msg.role === "bot" && msg.sources?.length > 0 && (
  <div
    style={{
      marginTop: "14px",
      borderTop: darkMode
        ? "1px solid rgba(255,255,255,0.08)"
        : "1px solid rgba(0,0,0,0.08)",
      paddingTop: "12px",
    }}
  >
    <div
      style={{
        fontWeight: 600,
        marginBottom: "10px",
        fontSize: "14px",
        opacity: 0.9,
      }}
    >
      Sources Used
    </div>

    {msg.sources.map((source, index) => (
      <div
        key={index}
        style={{
          padding: "10px",
          marginBottom: "10px",
          borderRadius: "10px",
          background: darkMode
            ? "rgba(255,255,255,0.05)"
            : "rgba(0,0,0,0.04)",
          fontSize: "13px",
        }}
      >
        <div style={{ fontWeight: 600 }}>
          {source.document}
        </div>

        <div
          style={{
            opacity: 0.8,
            marginBottom: "6px",
          }}
        >
          Page {source.page}
        </div>

        <div
          style={{
            opacity: 0.9,
            lineHeight: 1.5,
          }}
        >
          {source.preview}
        </div>
      </div>
    ))}
  </div>
)}
      </div>
    </div>
  );
};

export default MessageBubble;
