import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FiCommand, FiSearch, FiFile, FiX } from "react-icons/fi";

export default function SearchModal({ isOpen, onClose, pdfs, onSelectPdf, onNavigate }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults(pdfs?.slice(0, 5) || []);
      return;
    }
    const q = query.toLowerCase();
    const filtered = (pdfs || []).filter(
      (p) => p.name?.toLowerCase().includes(q)
    );
    setResults(filtered);
    setSelectedIdx(0);
  }, [query, pdfs]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[selectedIdx]) {
        onSelectPdf?.(results[selectedIdx].id);
        onClose();
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [results, selectedIdx, onSelectPdf, onClose]
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(4px)",
              zIndex: 9999,
            }}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -20 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            style={{
              position: "fixed",
              top: "12%",
              left: "50%",
              transform: "translateX(-50%)",
              width: "90%",
              maxWidth: 580,
              background: "var(--bg-secondary)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-color)",
              boxShadow: "var(--shadow-lg)",
              zIndex: 10000,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "16px 20px",
                borderBottom: "1px solid var(--border-color)",
              }}
            >
              <FiSearch style={{ color: "var(--text-tertiary)", fontSize: 18, flexShrink: 0 }} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search documents..."
                style={{
                  flex: 1,
                  border: "none",
                  background: "transparent",
                  color: "var(--text-primary)",
                  fontSize: 15,
                  outline: "none",
                }}
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  color: "var(--text-tertiary)",
                  fontSize: 11,
                }}
              >
                <FiCommand size={12} />
                <span>K</span>
              </div>
              <button
                onClick={onClose}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-tertiary)",
                  cursor: "pointer",
                  padding: 4,
                  display: "flex",
                }}
              >
                <FiX size={16} />
              </button>
            </div>

            <div style={{ maxHeight: 320, overflowY: "auto", padding: 8 }}>
              {results.length === 0 && query && (
                <div
                  style={{
                    padding: "24px",
                    textAlign: "center",
                    color: "var(--text-tertiary)",
                    fontSize: 14,
                  }}
                >
                  No documents found
                </div>
              )}
              {results.length === 0 && !query && (pdfs?.length === 0 || !pdfs) && (
                <div
                  style={{
                    padding: "24px",
                    textAlign: "center",
                    color: "var(--text-tertiary)",
                    fontSize: 14,
                  }}
                >
                  No documents yet. Upload a PDF to get started.
                </div>
              )}
              {results.map((pdf, idx) => (
                <motion.button
                  key={pdf.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.03 }}
                  onClick={() => {
                    onSelectPdf?.(pdf.id);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIdx(idx)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: "var(--radius-sm)",
                    border: "none",
                    background:
                      selectedIdx === idx
                        ? "var(--bg-elevated)"
                        : "transparent",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 14,
                    transition: "background var(--transition-fast)",
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "var(--radius-sm)",
                      background: "var(--bg-tertiary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--accent)",
                      flexShrink: 0,
                    }}
                  >
                    <FiFile size={14} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {pdf.name}
                    </div>
                    {pdf.chat?.length > 0 && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-tertiary)",
                          marginTop: 2,
                        }}
                      >
                        {pdf.chat.length} messages
                      </div>
                    )}
                  </div>
                </motion.button>
              ))}
            </div>

            <div
              style={{
                padding: "10px 20px",
                borderTop: "1px solid var(--border-color)",
                display: "flex",
                gap: 16,
                fontSize: 11,
                color: "var(--text-tertiary)",
              }}
            >
              <span>↑↓ Navigate</span>
              <span>↵ Open</span>
              <span>Esc Close</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
