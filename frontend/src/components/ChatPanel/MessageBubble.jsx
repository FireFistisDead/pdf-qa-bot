import React from "react";

import ReactMarkdown from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import BookmarkBorderIcon from "@mui/icons-material/BookmarkBorder";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";

// Strict allowlist for AI-generated markdown content.
//
// ReactMarkdown converts markdown to a virtual DOM; rehype-sanitize then
// walks that DOM and strips anything not in this schema before React renders
// it. This is the defence-in-depth layer that prevents a crafted LLM response
// from injecting <script>, <iframe>, event handlers, or javascript: URIs —
// even if a future change to the AI prompt or model allows them through.
//
// Rules:
//   - All elements in the default schema are kept (headings, lists, code, etc.)
//   - `href` values on <a> are restricted to http/https/mailto — no javascript:.
//   - Event handler attributes (onclick, onerror, …) are stripped globally.
//   - Protocol-relative links (//) are blocked at the attribute level.
const MARKDOWN_SANITIZE_SCHEMA = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // Override the default link allowlist: strip javascript: and data: URIs.
    a: [
      ...(defaultSchema.attributes?.a ?? []).filter((attr) => attr !== "href"),
      ["href", /^https?:\/\//i, /^mailto:/i],
    ],
    // Disallow all event handlers on every element via the wildcard "*" key.
    // defaultSchema already omits them, but this makes the policy explicit and
    // survives future schema updates from the rehype-sanitize package.
    "*": [
      ...(defaultSchema.attributes?.["*"] ?? []).filter(
        (attr) =>
          typeof attr !== "string" ||
          !attr.startsWith("on"),
      ),
    ],
  },
};

const MODE_BADGE = {
  default:  { label: "Standard",  bg: "rgba(107,114,128,0.15)", color: "#6B7280" },
  tutor:    { label: "Tutor",     bg: "rgba(59,130,246,0.15)",  color: "#3B82F6" },
  socratic: { label: "Socratic",  bg: "rgba(139,92,246,0.15)", color: "#8B5CF6" },
  eli5:     { label: "Simple",    bg: "rgba(34,197,94,0.15)",  color: "#22C55E" },
  concise:  { label: "Concise",   bg: "rgba(249,115,22,0.15)", color: "#F97316" },
};

const MessageBubble = ({
  msg,
  darkMode,
  onOpenSource,
  isBookmarked = false,
  onToggleBookmark,
  highlighted = false,
  registerMessageRef,
  onOptionClick,
}) => {
  const [copied, setCopied] = React.useState(false);
  const copyTimeoutRef = React.useRef(null);

  React.useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(msg.text);
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
      setCopied(false);
    }
  };

  const getSourceLabel = (source) => source.document || "Source Document";
  const hasOpenablePage = (source) => Boolean(source.page && source.document);

  let mainText = msg.text;
  let followup = null;
  
  if (msg.role === "bot" && typeof msg.text === "string") {
    const followupMatch = msg.text.match(/<FOLLOWUP>([\s\S]*?)<\/FOLLOWUP>/i);
    if (followupMatch) {
      mainText = msg.text.replace(followupMatch[0], "").trim();
      const followupContent = followupMatch[1].trim();
      
      const lines = followupContent.split('\n').map(l => l.trim()).filter(l => l);
      let question = "";
      const options = [];
      
      for (const line of lines) {
        if (line.toLowerCase().startsWith("question:")) {
          question = line.substring(9).trim();
        } else if (line.startsWith("- ")) {
          options.push(line.substring(2).trim());
        } else if (line.startsWith("-")) {
          options.push(line.substring(1).trim());
        }
      }
      
      if (question || options.length > 0) {
        followup = { question, options };
      }
    }
  }

  return (
    <div
      ref={registerMessageRef}
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
          outline: highlighted ? "2px solid #8B5CF6" : "none",
          outlineOffset: highlighted ? "3px" : "0",
          transition: "outline-color 0.2s ease, outline-offset 0.2s ease",
        }}
      >
        {msg.role === "bot" ? (
          <span>
            <ReactMarkdown rehypePlugins={[[rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA]]}>{mainText}</ReactMarkdown>
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

        {followup && !msg.streaming && (
          <div style={{
            marginTop: "16px",
            padding: "12px",
            borderRadius: "12px",
            background: darkMode ? "rgba(139, 92, 246, 0.1)" : "rgba(139, 92, 246, 0.05)",
            border: darkMode ? "1px solid rgba(139, 92, 246, 0.2)" : "1px solid rgba(139, 92, 246, 0.15)",
          }}>
            {followup.question && (
              <div style={{
                fontWeight: 600,
                color: darkMode ? "#E5E7EB" : "#1F2937",
                marginBottom: "10px",
                fontSize: "14px"
              }}>
                {followup.question}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {followup.options.map((opt, idx) => (
                <button
                  key={idx}
                  onClick={() => onOptionClick?.(opt)}
                  style={{
                    textAlign: "left",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    background: darkMode ? "rgba(255,255,255,0.05)" : "#FFFFFF",
                    border: darkMode ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.08)",
                    color: darkMode ? "#D1D5DB" : "#4B5563",
                    fontSize: "13px",
                    cursor: "pointer",
                    transition: "all 0.2s ease"
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = darkMode ? "rgba(139, 92, 246, 0.2)" : "rgba(139, 92, 246, 0.1)";
                    e.currentTarget.style.borderColor = "#8B5CF6";
                    e.currentTarget.style.color = darkMode ? "#FFF" : "#111";
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = darkMode ? "rgba(255,255,255,0.05)" : "#FFFFFF";
                    e.currentTarget.style.borderColor = darkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";
                    e.currentTarget.style.color = darkMode ? "#D1D5DB" : "#4B5563";
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
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

        {msg.role === "bot" && !msg.streaming && (
          <div
            style={{
              marginTop: "12px",
              display: "flex",
              justifyContent: "flex-start",
              gap: "8px",
            }}
          >
            <button
              type="button"
              onClick={() => onToggleBookmark?.(msg)}
              aria-pressed={isBookmarked}
              aria-label={isBookmarked ? "Remove saved answer" : "Save answer"}
              title={isBookmarked ? "Remove saved answer" : "Save answer"}
              className="save-answer-button"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 10px",
                borderRadius: "12px",
                border: isBookmarked
                  ? "1px solid rgba(245,158,11,0.45)"
                  : darkMode
                  ? "1px solid rgba(255,255,255,0.12)"
                  : "1px solid rgba(0,0,0,0.1)",
                background: isBookmarked
                  ? "rgba(245,158,11,0.12)"
                  : darkMode
                  ? "rgba(255,255,255,0.05)"
                  : "rgba(255,255,255,0.7)",
                color: isBookmarked ? "#D97706" : darkMode ? "#D1D5DB" : "#4B5563",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {isBookmarked ? (
                <BookmarkIcon sx={{ fontSize: 16 }} />
              ) : (
                <BookmarkBorderIcon sx={{ fontSize: 16 }} />
              )}
              {isBookmarked ? "Saved" : "Save Answer"}
            </button>
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copy to clipboard"
              title="Copy answer"
              className="copy-answer-button"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 10px",
                borderRadius: "12px",
                border: darkMode
                  ? "1px solid rgba(255,255,255,0.12)"
                  : "1px solid rgba(0,0,0,0.1)",
                background: copied
                  ? "rgba(34,197,94,0.12)"
                  : darkMode
                  ? "rgba(255,255,255,0.05)"
                  : "rgba(255,255,255,0.7)",
                color: copied ? "#22C55E" : darkMode ? "#D1D5DB" : "#4B5563",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {copied ? (
                <CheckIcon sx={{ fontSize: 16 }} />
              ) : (
                <ContentCopyIcon sx={{ fontSize: 16 }} />
              )}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        )}

        {msg.role === "bot" && !msg.streaming && msg.sources?.length > 0 && (() => {
          // deduplicate sources by document and page
          const uniqueSources = [];
          const seen = new Set();
          msg.sources.forEach(source => {
            const label = getSourceLabel(source);
            const page = source.page || "unknown";
            const key = `${label}-${page}`;
            if (!seen.has(key)) {
               seen.add(key);
               uniqueSources.push(source);
            }
          });

          return (
            <div
              style={{
                marginTop: "14px",
                paddingTop: "12px",
                display: "flex",
                flexWrap: "wrap",
                gap: "8px"
              }}
            >
              {uniqueSources.map((source, index) => {
                const sourceLabel = getSourceLabel(source);
                const canOpenPage = hasOpenablePage(source);
                const isWebSource = source.type === "web";
                const truncatedLabel = sourceLabel.length > 24 
                  ? sourceLabel.substring(0, 21) + "..." 
                  : sourceLabel;
                  
                return (
                  <button
                    key={`${source.document_id || sourceLabel}-${source.page || "unknown"}-${index}`}
                    onClick={() => {
                      if (isWebSource && source.url) {
                        try {
                          const url = new URL(source.url);
                          if (!["http:", "https:"].includes(url.protocol)) return;
                          const opened = window.open(
                            url.toString(),
                            "_blank",
                            "noopener,noreferrer",
                          );
                          if (opened) opened.opener = null;
                        } catch {
                          return;
                        }
                      } else if (canOpenPage) {
                        onOpenSource?.(source);
                      }
                    }}
                    title={sourceLabel}
                    className="citation-chip"
                    style={{
                      padding: "4px 10px",
                      borderRadius: "16px",
                      background: darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
                      border: darkMode ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(0,0,0,0.1)",
                      color: darkMode ? "#D1D5DB" : "#4B5563",
                      fontSize: "12px",
                      fontWeight: 500,
                      cursor: (canOpenPage || isWebSource) ? "pointer" : "default",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px"
                    }}
                  >
                    <span style={{ opacity: 0.8 }}>{isWebSource ? "🌐" : "📄"}</span>
                    <span>{truncatedLabel}{(source.page && !isWebSource) ? ` — Page ${source.page}` : ""}</span>
                  </button>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default MessageBubble;
