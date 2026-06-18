import React from "react";
import ReactMarkdown from "react-markdown";
import MenuBookIcon from "@mui/icons-material/MenuBook";

const MODE_BADGE = {
  default:  { label: "Standard",  bg: "rgba(107,114,128,0.15)", color: "#6B7280" },
  tutor:    { label: "Tutor",     bg: "rgba(59,130,246,0.15)",  color: "#3B82F6" },
  socratic: { label: "Socratic",  bg: "rgba(139,92,246,0.15)", color: "#8B5CF6" },
  eli5:     { label: "Simple",    bg: "rgba(34,197,94,0.15)",  color: "#22C55E" },
  concise:  { label: "Concise",   bg: "rgba(249,115,22,0.15)", color: "#F97316" },
};

const MessageBubble = ({ msg, darkMode, onOpenSource }) => {
  const getSourceText = (source) => source.preview || source.text;
  const getSourceLabel = (source) => source.document || "Source Document";
  const hasOpenablePage = (source) => Boolean(source.page && source.document);

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
            msg.role === "user" ? "0 8px 20px rgba(124,77,255,0.22)" : "none",

          lineHeight: 1.65,
          fontSize: "14.5px",
          padding: "12px 15px",
          wordBreak: "break-word",
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
              marginTop: "12px",
              borderTop: darkMode
                ? "1px solid rgba(255,255,255,0.08)"
                : "1px solid rgba(0,0,0,0.08)",
              paddingTop: "10px",
            }}
          >
            <div
              style={{
                fontWeight: 600,
                marginBottom: "8px",
                fontSize: "13px",
                opacity: 0.9,
              }}
            >
              Sources used
            </div>

            {msg.sources.map((source, index) => {
              const sourceText = getSourceText(source);
              const sourceLabel = getSourceLabel(source);
              const canOpenPage = hasOpenablePage(source);

              return (
                <div
                  key={`${source.document_id || sourceLabel}-${source.page || "unknown"}-${index}`}
                  style={{
                    padding: "9px 10px",
                    marginBottom: "8px",
                    borderRadius: "10px",
                    background: darkMode
                      ? "rgba(255,255,255,0.05)"
                      : "rgba(0,0,0,0.04)",
                    fontSize: "12.5px",
                  }}
                >
                  <div className="d-flex justify-content-between align-items-start gap-2">
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }} className="text-truncate">
                        {sourceLabel}
                      </div>

                      <div
                        style={{
                          opacity: 0.75,
                          marginBottom: sourceText ? "5px" : 0,
                          fontSize: "12px",
                        }}
                      >
                        {source.page ? `Page ${source.page}` : "Source page unavailable"}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!canOpenPage}
                      onClick={() => onOpenSource?.(source)}
                      style={{
                        flexShrink: 0,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "5px 9px",
                        borderRadius: "8px",
                        fontSize: "11.5px",
                        fontWeight: 600,
                        border: darkMode ? "1px solid rgba(255,255,255,0.16)" : "1px solid rgba(0,0,0,0.14)",
                        background: "transparent",
                        color: darkMode ? "#E5E7EB" : "#374151",
                        cursor: canOpenPage ? "pointer" : "default",
                        opacity: canOpenPage ? 1 : 0.45,
                      }}
                    >
                      <MenuBookIcon sx={{ fontSize: 13 }} />
                      Open
                    </button>
                  </div>

                  {sourceText && (
                    <div
                      style={{
                        opacity: 0.85,
                        lineHeight: 1.5,
                        fontStyle: "italic",
                      }}
                    >
                      “{sourceText}”
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;
