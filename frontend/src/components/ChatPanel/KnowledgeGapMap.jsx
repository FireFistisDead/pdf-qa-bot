import React from "react";

/**
 * KnowledgeGapMap
 *
 * Renders the structured knowledge-gap analysis panel.
 * This is NOT a chat message — it is a document-level output panel
 * rendered above the chat history inside ChatPanel.
 *
 * Props:
 *   result     — API response object from POST /knowledge-gaps (or null)
 *   darkMode   — boolean
 *   onOpenSource(source) — same page-jump callback used by citation chips
 *   onDismiss() — collapses/hides the panel
 */
const KnowledgeGapMap = ({ result, darkMode, onOpenSource, onDismiss }) => {
  if (!result) return null;

  // ── colours derived from darkMode ──────────────────────────────────────────
  const panelBg = darkMode ? "rgba(255,255,255,0.04)" : "#F8FAFC";
  const panelBorder = darkMode
    ? "1px solid rgba(255,255,255,0.08)"
    : "1px solid rgba(0,0,0,0.08)";
  const headerColor = darkMode ? "#E0E7FF" : "#1E293B";
  const subtitleColor = darkMode ? "#9CA3AF" : "#64748B";
  const rowBorderColor = darkMode
    ? "rgba(255,255,255,0.06)"
    : "rgba(0,0,0,0.05)";
  const termColor = darkMode ? "#F1F5F9" : "#0F172A";
  const noGapsBg = darkMode ? "rgba(34,197,94,0.08)" : "rgba(34,197,94,0.06)";
  const noGapsBorder = darkMode
    ? "1px solid rgba(34,197,94,0.2)"
    : "1px solid rgba(34,197,94,0.18)";
  const warnBg = darkMode ? "rgba(251,191,36,0.08)" : "rgba(251,191,36,0.06)";
  const warnBorder = darkMode
    ? "1px solid rgba(251,191,36,0.2)"
    : "1px solid rgba(251,191,36,0.18)";

  // ── unreadable / image-only PDF ─────────────────────────────────────────────
  if (!result.scanned) {
    return (
      <div
        style={{
          margin: "0 0 16px 0",
          padding: "14px 16px",
          borderRadius: "16px",
          background: warnBg,
          border: warnBorder,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <span style={{ fontWeight: 700, color: "#F59E0B", fontSize: "13px" }}>
              ⚠️ Unable to analyse
            </span>
            <div
              style={{ fontSize: "13px", color: subtitleColor, marginTop: "4px" }}
            >
              {result.message ||
                "This PDF appears to contain no extractable text. Knowledge gap analysis requires readable text content."}
            </div>
          </div>
          <button
            id="btn-close-knowledge-gap-map"
            onClick={onDismiss}
            aria-label="Dismiss knowledge gap panel"
            style={dismissBtnStyle(darkMode)}
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  // ── zero gaps found ─────────────────────────────────────────────────────────
  if (result.concept_count === 0) {
    return (
      <div
        style={{
          margin: "0 0 16px 0",
          padding: "14px 16px",
          borderRadius: "16px",
          background: noGapsBg,
          border: noGapsBorder,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <span style={{ fontWeight: 700, color: "#22C55E", fontSize: "13px" }}>
              ✅ No knowledge gaps detected
            </span>
            <div
              style={{ fontSize: "13px", color: subtitleColor, marginTop: "4px" }}
            >
              This document appears to define all the concepts it uses. No prior
              knowledge gaps detected.
            </div>
          </div>
          <button
            id="btn-close-knowledge-gap-map"
            onClick={onDismiss}
            aria-label="Dismiss knowledge gap panel"
            style={dismissBtnStyle(darkMode)}
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  // ── full map ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        margin: "0 0 16px 0",
        borderRadius: "16px",
        background: panelBg,
        border: panelBorder,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          padding: "12px 16px 10px 16px",
          borderBottom: rowBorderColor ? `1px solid ${rowBorderColor}` : undefined,
        }}
      >
        <div>
          <div
            style={{
              fontWeight: 700,
              fontSize: "13px",
              color: headerColor,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span>📋</span>
            <span>
              Knowledge Gap Map
              {result.document ? ` — ${result.document}` : ""}
            </span>
          </div>
          <div style={{ fontSize: "12px", color: subtitleColor, marginTop: "3px" }}>
            These concepts are used but never defined in this document. Click any
            page to jump there.
          </div>
          {result.short_document && (
            <div
              style={{
                fontSize: "11px",
                color: "#F59E0B",
                marginTop: "4px",
              }}
            >
              Note: short documents may yield fewer results.
            </div>
          )}
        </div>
        <button
          id="btn-close-knowledge-gap-map"
          onClick={onDismiss}
          aria-label="Dismiss knowledge gap panel"
          style={dismissBtnStyle(darkMode)}
        >
          ×
        </button>
      </div>

      {/* Concept rows */}
      <div>
        {result.concepts.map((concept, idx) => (
          <div
            key={`${concept.term}-${idx}`}
            style={{
              display: "flex",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: "8px",
              padding: "9px 16px",
              borderBottom:
                idx < result.concepts.length - 1
                  ? `1px solid ${rowBorderColor}`
                  : "none",
            }}
          >
            {/* Term label */}
            <span
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: termColor,
                minWidth: "120px",
                flex: "0 0 auto",
                paddingTop: "2px",
              }}
            >
              {concept.term}
            </span>

            {/* Page chips — identical appearance to citation chips */}
            <div
              style={{ display: "flex", flexWrap: "wrap", gap: "6px", flex: 1 }}
            >
              {concept.pages.map((page) => (
                <button
                  key={page}
                  id={`kg-chip-${concept.term.replace(/\s+/g, "-")}-p${page}`}
                  className="citation-chip"
                  onClick={() =>
                    onOpenSource?.({ page, document: result.document })
                  }
                  title={`Jump to page ${page}`}
                  style={{
                    padding: "3px 9px",
                    borderRadius: "16px",
                    background: darkMode
                      ? "rgba(255,255,255,0.08)"
                      : "rgba(0,0,0,0.05)",
                    border: darkMode
                      ? "1px solid rgba(255,255,255,0.12)"
                      : "1px solid rgba(0,0,0,0.1)",
                    color: darkMode ? "#D1D5DB" : "#4B5563",
                    fontSize: "12px",
                    fontWeight: 500,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <span style={{ opacity: 0.7, fontSize: "11px" }}>📄</span>
                  <span>Page {page}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Shared style helpers ────────────────────────────────────────────────────
const dismissBtnStyle = (darkMode) => ({
  background: "none",
  border: "none",
  cursor: "pointer",
  color: darkMode ? "#9CA3AF" : "#94A3B8",
  fontSize: "18px",
  lineHeight: 1,
  padding: "0 0 0 8px",
  flexShrink: 0,
});

export default KnowledgeGapMap;
