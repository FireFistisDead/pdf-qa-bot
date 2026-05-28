import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { motion } from "framer-motion";
import { FiCopy, FiCheck, FiUser, FiCpu, FiRefreshCw, FiThumbsUp, FiThumbsDown } from "react-icons/fi";
import toast from "react-hot-toast";
import TypingIndicator from "../ui/TypingIndicator";

const MARKDOWN_SANITIZE_SCHEMA = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [
      ...(defaultSchema.attributes?.a ?? []).filter((attr) => attr !== "href"),
      ["href", /^https?:\/\//i, /^mailto:/i],
    ],
    "*": [
      ...(defaultSchema.attributes?.["*"] ?? []).filter(
        (attr) => typeof attr !== "string" || !attr.startsWith("on")
      ),
    ],
  },
};

const MODE_BADGE = {
  default: { label: "Standard", bg: "rgba(107,114,128,0.15)", color: "#6B7280" },
  tutor: { label: "Tutor", bg: "rgba(59,130,246,0.15)", color: "#3B82F6" },
  socratic: { label: "Socratic", bg: "rgba(139,92,246,0.15)", color: "#8B5CF6" },
  eli5: { label: "Simple", bg: "rgba(34,197,94,0.15)", color: "#22C55E" },
  concise: { label: "Concise", bg: "rgba(249,115,22,0.15)", color: "#F97316" },
};

const messageVariants = {
  initial: { opacity: 0, y: 16, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.15 } },
};

function CodeBlock({ className, children, darkMode }) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "";
  const code = String(children).replace(/\n$/, "");

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Code copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  if (language) {
    return (
      <div
        style={{
          position: "relative",
          margin: "12px 0",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
          border: "1px solid var(--border-color)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 14px",
            background: darkMode ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.04)",
            borderBottom: "1px solid var(--border-color)",
            fontSize: 11,
            color: "var(--text-tertiary)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          <span>{language}</span>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleCopy}
            aria-label={copied ? "Copied" : "Copy code"}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-tertiary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              padding: "3px 8px",
              borderRadius: 4,
              transition: "color var(--transition-fast)",
              fontFamily: "var(--font-sans)",
            }}
          >
            {copied ? <FiCheck size={12} /> : <FiCopy size={12} />}
            {copied ? "Copied" : "Copy"}
          </motion.button>
        </div>
        <SyntaxHighlighter
          style={darkMode ? oneDark : oneLight}
          language={language}
          PreTag="div"
          customStyle={{
            margin: 0,
            borderRadius: 0,
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    );
  }

  return (
    <code
      style={{
        background: darkMode ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.05)",
        padding: "2px 6px",
        borderRadius: 4,
        fontSize: "0.9em",
        fontFamily: "var(--font-mono)",
      }}
    >
      {children}
    </code>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.button
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={handleCopy}
      aria-label="Copy message"
      style={{
        background: "var(--bg-glass)",
        border: "1px solid var(--border-color)",
        color: "var(--text-tertiary)",
        cursor: "pointer",
        padding: 5,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--radius-sm)",
        opacity: 0,
        transition: "opacity 0.2s, color var(--transition-fast), background var(--transition-fast)",
      }}
    >
      {copied ? <FiCheck size={12} /> : <FiCopy size={12} />}
    </motion.button>
  );
}

function MessageTime({ timestamp }) {
  if (!timestamp) return null;
  const d = new Date(timestamp);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <span
      style={{
        fontSize: 10,
        color: "var(--text-tertiary)",
        fontWeight: 500,
      }}
    >
      {isToday ? time : `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`}
    </span>
  );
}

export default function MessageBubble({ msg, darkMode, onOpenSource, onRegenerate, isLast }) {
  const getSourceLabel = (source) => source.document || "Source Document";
  const hasOpenablePage = (source) => Boolean(source.page && source.document);

  const isUser = msg.role === "user";

  return (
    <motion.div
      variants={messageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 28,
        mass: 0.8,
      }}
      style={{
        display: "flex",
        gap: 12,
        marginBottom: 20,
        flexDirection: isUser ? "row-reverse" : "row",
        alignItems: "flex-start",
        position: "relative",
      }}
      role="listitem"
    >
      {/* Avatar */}
      <motion.div
        whileHover={{ scale: 1.1 }}
        style={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          background: isUser
            ? "var(--accent-gradient)"
            : "var(--bg-tertiary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: isUser ? "#fff" : "var(--accent)",
          fontSize: 14,
          flexShrink: 0,
          boxShadow: isUser
            ? "0 4px 12px rgba(99,102,241,0.25)"
            : "none",
          border: isUser ? "none" : "1px solid var(--border-color)",
        }}
      >
        {isUser ? <FiUser size={14} /> : <FiCpu size={14} />}
      </motion.div>

      {/* Bubble */}
      <div style={{ maxWidth: "80%", minWidth: 0 }}>
        <div
          style={{
            padding: "14px 18px",
            borderRadius: isUser
              ? "18px 18px 4px 18px"
              : "18px 18px 18px 4px",
            background: isUser
              ? "var(--accent-gradient)"
              : "var(--bg-card)",
            border: isUser
              ? "none"
              : "1px solid var(--border-color)",
            boxShadow: isUser
              ? "0 8px 24px rgba(99,102,241,0.2)"
              : "var(--shadow-sm)",
            backdropFilter: "blur(12px)",
            lineHeight: 1.7,
            fontSize: 14,
            color: isUser ? "#fff" : "var(--text-primary)",
            position: "relative",
          }}
        >
          {isUser ? (
            <span style={{ whiteSpace: "pre-wrap", fontWeight: 450 }}>
              {msg.text}
            </span>
          ) : (
            <span>
              <ReactMarkdown
                rehypePlugins={[[rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA]]}
                components={{
                  code({ node, inline, className, children, ...props }) {
                    if (inline) {
                      return (
                        <code
                          style={{
                            background: darkMode ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.06)",
                            padding: "2px 6px",
                            borderRadius: 4,
                            fontSize: "0.9em",
                            fontFamily: "var(--font-mono)",
                            color: "var(--accent)",
                          }}
                          {...props}
                        >
                          {children}
                        </code>
                      );
                    }
                    return (
                      <CodeBlock className={className} darkMode={darkMode}>
                        {children}
                      </CodeBlock>
                    );
                  },
                  a({ href, children }) {
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "var(--accent)", textDecoration: "underline" }}
                      >
                        {children}
                      </a>
                    );
                  },
                  p({ children }) {
                    return <span style={{ display: "block", marginBottom: 8, "&:last-child": { marginBottom: 0 } }}>{children}</span>;
                  },
                  ul({ children }) {
                    return (
                      <ul style={{ margin: "8px 0", paddingLeft: 20 }}>
                        {children}
                      </ul>
                    );
                  },
                  ol({ children }) {
                    return (
                      <ol style={{ margin: "8px 0", paddingLeft: 20 }}>
                        {children}
                      </ol>
                    );
                  },
                  li({ children }) {
                    return <li style={{ marginBottom: 4 }}>{children}</li>;
                  },
                  blockquote({ children }) {
                    return (
                      <div
                        style={{
                          borderLeft: "3px solid var(--accent)",
                          paddingLeft: 12,
                          margin: "8px 0",
                          color: "var(--text-secondary)",
                          fontStyle: "italic",
                        }}
                      >
                        {children}
                      </div>
                    );
                  },
                  h1({ children }) {
                    return (
                      <h1
                        style={{
                          fontSize: 18,
                          fontWeight: 700,
                          margin: "12px 0 8px",
                          color: "var(--text-primary)",
                        }}
                      >
                        {children}
                      </h1>
                    );
                  },
                  h2({ children }) {
                    return (
                      <h2
                        style={{
                          fontSize: 16,
                          fontWeight: 700,
                          margin: "10px 0 6px",
                          color: "var(--text-primary)",
                        }}
                      >
                        {children}
                      </h2>
                    );
                  },
                  h3({ children }) {
                    return (
                      <h3
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                          margin: "8px 0 4px",
                          color: "var(--text-primary)",
                        }}
                      >
                        {children}
                      </h3>
                    );
                  },
                  hr() {
                    return (
                      <hr
                        style={{
                          border: "none",
                          borderTop: "1px solid var(--border-color)",
                          margin: "12px 0",
                        }}
                      />
                    );
                  },
                  table({ children }) {
                    return (
                      <div style={{ overflowX: "auto", margin: "12px 0" }}>
                        <table
                          style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            fontSize: 13,
                          }}
                        >
                          {children}
                        </table>
                      </div>
                    );
                  },
                  th({ children }) {
                    return (
                      <th
                        style={{
                          border: "1px solid var(--border-color)",
                          padding: "8px 12px",
                          background: "var(--bg-elevated)",
                          fontWeight: 600,
                          textAlign: "left",
                        }}
                      >
                        {children}
                      </th>
                    );
                  },
                  td({ children }) {
                    return (
                      <td
                        style={{
                          border: "1px solid var(--border-color)",
                          padding: "6px 12px",
                        }}
                      >
                        {children}
                      </td>
                    );
                  },
                }}
              >
                {msg.text || (msg.streaming ? "" : "")}
              </ReactMarkdown>
              {msg.streaming && <TypingIndicator />}
            </span>
          )}

          {/* Mode badge */}
          {!isUser && msg.mode && msg.mode !== "default" && (() => {
            const badge = MODE_BADGE[msg.mode] || MODE_BADGE.default;
            return (
              <div style={{ marginTop: 8 }}>
                <span
                  style={{
                    fontSize: "0.65rem",
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: 10,
                    background: badge.bg,
                    color: badge.color,
                    letterSpacing: "0.02em",
                  }}
                >
                  {badge.label}
                </span>
              </div>
            );
          })()}
        </div>

        {/* Footer: timestamp + action buttons */}
        {!msg.streaming && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginTop: 4,
              padding: isUser ? "0 4px 0 0" : "0 0 0 4px",
              justifyContent: isUser ? "flex-end" : "flex-start",
              opacity: 0.7,
              transition: "opacity 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.7)}
          >
            <MessageTime timestamp={msg.timestamp} />
            {!isUser && msg.text && (
              <>
                <CopyButton text={msg.text} />
                {onRegenerate && (
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={onRegenerate}
                    title="Regenerate response"
                    aria-label="Regenerate response"
                    style={{
                      background: "var(--bg-glass)",
                      border: "1px solid var(--border-color)",
                      color: "var(--text-tertiary)",
                      cursor: "pointer",
                      padding: 5,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "var(--radius-sm)",
                      opacity: 0,
                      transition: "opacity 0.2s, color var(--transition-fast), background var(--transition-fast)",
                    }}
                  >
                    <FiRefreshCw size={12} />
                  </motion.button>
                )}
              </>
            )}
          </div>
        )}

        {/* Sources */}
        {!isUser && !msg.streaming && msg.sources?.length > 0 && (() => {
          const uniqueSources = [];
          const seen = new Set();
          msg.sources.forEach((source) => {
            const label = getSourceLabel(source);
            const page = source.page || "unknown";
            const key = `${label}-${page}`;
            if (!seen.has(key)) {
              seen.add(key);
              uniqueSources.push(source);
            }
          });

          return (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, paddingLeft: 0 }}
            >
              {uniqueSources.map((source, index) => {
                const sourceLabel = getSourceLabel(source);
                const canOpenPage = hasOpenablePage(source);
                const truncatedLabel =
                  sourceLabel.length > 24
                    ? sourceLabel.substring(0, 21) + "..."
                    : sourceLabel;

                return (
                  <motion.button
                    key={`${source.document_id || sourceLabel}-${source.page || "unknown"}-${index}`}
                    whileHover={{ y: -2, scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => canOpenPage && onOpenSource?.(source)}
                    title={sourceLabel}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 16,
                      background: darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
                      border: darkMode
                        ? "1px solid rgba(255,255,255,0.1)"
                        : "1px solid rgba(0,0,0,0.08)",
                      color: "var(--text-secondary)",
                      fontSize: 11,
                      fontWeight: 500,
                      cursor: canOpenPage ? "pointer" : "default",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontFamily: "var(--font-sans)",
                      transition: "all var(--transition-fast)",
                    }}
                  >
                    <span style={{ fontSize: 10, opacity: 0.7 }}>P</span>
                    <span>
                      Page {source.page}
                      {source.section ? ` - ${source.section}` : ""}
                    </span>
                  </motion.button>
                );
              })}
            </motion.div>
          );
        })()}
      </div>
    </motion.div>
  );
}
