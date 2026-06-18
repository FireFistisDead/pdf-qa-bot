import React, { useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import { saveAs } from "file-saver";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";

const ExportMenu = ({ currentChat, selectedPdfName }) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const disabled = !selectedPdfName || !currentChat || currentChat.length === 0;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const exportChat = (type) => {
    if (disabled) return;

    if (type === "csv") {
      const csv = Papa.unparse(currentChat);
      const blob = new Blob([csv], { type: "text/csv" });
      saveAs(blob, `${selectedPdfName}-chat.csv`);
    } else if (type === "pdf") {
      const text = currentChat.map((msg) => `${msg.role}: ${msg.text}`).join("\n\n");
      const blob = new Blob([text], { type: "application/pdf" });
      saveAs(blob, `${selectedPdfName}-chat.pdf`);
    }
    setOpen(false);
  };

  return (
    <div ref={menuRef} style={{ position: "relative" }}>
      <button
        type="button"
        title="Export this conversation"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: "7px 12px",
          borderRadius: "10px",
          fontSize: "13px",
          fontWeight: 600,
          border: "1px solid rgba(107,114,128,0.35)",
          background: "transparent",
          color: "#6B7280",
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.45 : 1,
          whiteSpace: "nowrap",
        }}
      >
        <FileDownloadOutlinedIcon sx={{ fontSize: 15 }} />
        <span className="d-none d-sm-inline">Export</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: "150px",
            borderRadius: "12px",
            overflow: "hidden",
            background: "#1f2430",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 16px 36px rgba(0,0,0,0.35)",
            zIndex: 20,
            animation: "fadeSlideUp 0.18s ease",
          }}
        >
          {[
            { type: "pdf", label: "As text file" },
            { type: "csv", label: "As CSV" },
          ].map((opt) => (
            <button
              key={opt.type}
              type="button"
              onClick={() => exportChat(opt.type)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 14px",
                fontSize: "13px",
                fontWeight: 500,
                color: "#E5E7EB",
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(139,92,246,0.15)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ExportMenu;
