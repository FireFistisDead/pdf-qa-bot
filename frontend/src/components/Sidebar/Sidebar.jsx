import React, { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiSearch,
  FiUpload,
  FiChevronLeft,
  FiChevronRight,
  FiMenu,
  FiX,
  FiPlus,
  FiFileText,
} from "react-icons/fi";

const FILE_COLORS = [
  { bg: "rgba(99,102,241,0.15)", color: "#818CF8" },
  { bg: "rgba(6,182,212,0.15)", color: "#22D3EE" },
  { bg: "rgba(34,197,94,0.15)", color: "#4ADE80" },
  { bg: "rgba(245,158,11,0.15)", color: "#FBBF24" },
  { bg: "rgba(244,63,94,0.15)", color: "#FB7185" },
  { bg: "rgba(168,85,247,0.15)", color: "#C084FC" },
];

const sidebarVariants = {
  open: {
    width: "var(--sidebar-width)",
    transition: { type: "spring", stiffness: 300, damping: 30 },
  },
  collapsed: {
    width: "var(--sidebar-collapsed-width)",
    transition: { type: "spring", stiffness: 300, damping: 30 },
  },
};

const mobileOverlayVariants = {
  hidden: { opacity: 0, transition: { duration: 0.15 } },
  visible: { opacity: 1, transition: { duration: 0.2 } },
};

const mobileDrawerVariants = {
  hidden: { x: "-100%", transition: { type: "spring", stiffness: 400, damping: 35 } },
  visible: { x: 0, transition: { type: "spring", stiffness: 400, damping: 35 } },
};

function getFileColor(index) {
  return FILE_COLORS[index % FILE_COLORS.length];
}

function PdfIcon({ index, collapsed, selected }) {
  const color = getFileColor(index);
  return (
    <div
      style={{
        width: collapsed ? 32 : 28,
        height: collapsed ? 32 : 28,
        borderRadius: "var(--radius-sm)",
        background: selected ? "rgba(255,255,255,0.15)" : color.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: selected ? "#fff" : color.color,
        flexShrink: 0,
        fontSize: collapsed ? 15 : 13,
        transition: "all var(--transition-fast)",
      }}
    >
      <FiFileText />
    </div>
  );
}

export default function Sidebar({
  pdfs,
  selectedPdf,
  onSelectPdf,
  onUpload,
  darkMode,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const fileInputRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setMobileOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const filteredPdfs = useMemo(
    () =>
      pdfs.filter((p) =>
        p.name?.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [pdfs, searchQuery]
  );

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file && onUpload) {
      onUpload(file);
    }
    e.target.value = "";
  };

  const sidebarContent = (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: darkMode
          ? "rgba(15, 23, 42, 0.85)"
          : "rgba(248, 250, 252, 0.85)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderRight: "1px solid var(--border-color)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: collapsed ? "20px 10px" : "20px 16px 16px",
          borderBottom: "1px solid var(--border-color)",
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          minHeight: 64,
        }}
      >
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ display: "flex", alignItems: "center", gap: 10 }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: "var(--radius-md)",
                background: "var(--accent-gradient)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 15,
                fontWeight: 700,
                flexShrink: 0,
                boxShadow: "0 4px 12px rgba(99,102,241,0.3)",
              }}
            >
              P
            </div>
            <div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 15,
                  color: "var(--text-primary)",
                  letterSpacing: "-0.02em",
                }}
              >
                Documents
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                  fontWeight: 500,
                }}
              >
                {pdfs.length} file{pdfs.length !== 1 ? "s" : ""}
              </div>
            </div>
          </motion.div>
        )}
        <motion.button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          style={{
            background: "var(--bg-glass)",
            border: "1px solid var(--border-color)",
            color: "var(--text-tertiary)",
            cursor: "pointer",
            padding: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "var(--radius-sm)",
            transition: "all var(--transition-fast)",
          }}
        >
          {collapsed ? <FiChevronRight size={16} /> : <FiChevronLeft size={16} />}
        </motion.button>
      </div>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            style={{ padding: "8px 14px 4px", overflow: "hidden" }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderRadius: "var(--radius-md)",
                background: darkMode ? "rgba(30, 41, 59, 0.6)" : "rgba(241, 245, 249, 0.8)",
                border: "1px solid var(--border-color)",
                transition: "border-color var(--transition-fast)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-color)")}
            >
              <FiSearch size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search documents..."
                aria-label="Search documents"
                style={{
                  flex: 1,
                  border: "none",
                  background: "transparent",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  outline: "none",
                }}
              />
              {searchQuery && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search"
                  whileHover={{ scale: 1.1 }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-tertiary)",
                    cursor: "pointer",
                    padding: 2,
                    display: "flex",
                  }}
                >
                  <FiX size={14} />
                </motion.button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: collapsed ? "8px 6px" : "4px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {filteredPdfs.length === 0 && !collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              padding: "32px 16px",
              textAlign: "center",
              color: "var(--text-tertiary)",
              fontSize: 13,
              lineHeight: 1.7,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "var(--radius-lg)",
                background: "var(--bg-glass)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 12px",
                color: "var(--text-tertiary)",
                fontSize: 20,
              }}
            >
              <FiFileText />
            </div>
            {searchQuery
              ? "No matching documents"
              : "No documents yet.\nUpload a PDF to get started."}
          </motion.div>
        )}
        <AnimatePresence mode="popLayout">
          {filteredPdfs.map((pdf, idx) => {
            const isSelected = selectedPdf === pdf.id;
            return (
              <motion.button
                key={pdf.id}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 30,
                  delay: idx * 0.02,
                }}
                onClick={() => {
                  onSelectPdf(pdf.id);
                  setMobileOpen(false);
                }}
                whileHover={!collapsed ? { x: 4 } : { scale: 1.05 }}
                whileTap={{ scale: 0.97 }}
                title={collapsed ? pdf.name : undefined}
                aria-label={`Select document: ${pdf.name}`}
                aria-current={isSelected ? "true" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: collapsed ? "14px 0" : "10px 12px",
                  borderRadius: "var(--radius-md)",
                  border: isSelected
                    ? "1px solid rgba(99,102,241,0.3)"
                    : "1px solid transparent",
                  background: isSelected
                    ? "var(--accent-gradient)"
                    : "transparent",
                  color: isSelected ? "#fff" : "var(--text-secondary)",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: 13,
                  fontWeight: isSelected ? 600 : 400,
                  transition: "all var(--transition-fast)",
                  justifyContent: collapsed ? "center" : "flex-start",
                  width: "100%",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <PdfIcon index={idx} collapsed={collapsed} selected={isSelected} />
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      flex: 1,
                    }}
                  >
                    {pdf.name}
                  </motion.span>
                )}
                {isSelected && !collapsed && (
                  <motion.div
                    layoutId="activeIndicator"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#fff",
                      flexShrink: 0,
                    }}
                  />
                )}
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            style={{
              padding: "12px 14px 16px",
              borderTop: "1px solid var(--border-color)",
            }}
          >
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Upload PDF document"
              style={{
                width: "100%",
                padding: "10px 16px",
                borderRadius: "var(--radius-md)",
                border: "1.5px dashed var(--border-hover)",
                background: "var(--bg-glass)",
                color: "var(--text-secondary)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 600,
                transition: "all var(--transition-fast)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--accent)";
                e.currentTarget.style.color = "var(--accent)";
                e.currentTarget.style.background = "rgba(99,102,241,0.06)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border-hover)";
                e.currentTarget.style.color = "var(--text-secondary)";
                e.currentTarget.style.background = "var(--bg-glass)";
              }}
            >
              <FiUpload size={14} />
              Upload PDF
            </motion.button>
            <div
              style={{
                marginTop: 8,
                fontSize: 10,
                color: "var(--text-tertiary)",
                textAlign: "center",
              }}
            >
              PDF up to 20MB
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {collapsed && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ padding: "8px", borderTop: "1px solid var(--border-color)" }}
        >
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => fileInputRef.current?.click()}
            aria-label="Upload PDF"
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "var(--radius-md)",
              border: "1px dashed var(--border-hover)",
              background: "transparent",
              color: "var(--text-tertiary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all var(--transition-fast)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent)";
              e.currentTarget.style.color = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border-hover)";
              e.currentTarget.style.color = "var(--text-tertiary)";
            }}
          >
            <FiPlus size={18} />
          </motion.button>
        </motion.div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        style={{ display: "none" }}
        onChange={handleFileSelect}
        aria-hidden="true"
      />
    </div>
  );

  return (
    <>
      <motion.button
        onClick={() => setMobileOpen(true)}
        aria-label="Open sidebar menu"
        style={{
          position: "fixed",
          top: 74,
          left: 12,
          zIndex: 100,
          width: 40,
          height: 40,
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border-color)",
          background: darkMode ? "var(--bg-secondary)" : "#fff",
          color: "var(--text-primary)",
          cursor: "pointer",
          display: "none",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "var(--shadow-md)",
        }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="mobile-sidebar-toggle"
      >
        <FiMenu size={18} />
      </motion.button>

      <motion.aside
        variants={sidebarVariants}
        initial={false}
        animate={collapsed ? "collapsed" : "open"}
        style={{
          height: "100vh",
          position: "sticky",
          top: 0,
          flexShrink: 0,
          overflow: "hidden",
          zIndex: 40,
        }}
        className="desktop-sidebar"
        role="navigation"
        aria-label="Document sidebar"
      >
        {sidebarContent}
      </motion.aside>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            variants={mobileOverlayVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(4px)",
              zIndex: 200,
            }}
            onClick={() => setMobileOpen(false)}
          >
            <motion.aside
              variants={mobileDrawerVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                bottom: 0,
                width: "85vw",
                maxWidth: 340,
                zIndex: 201,
                boxShadow: "var(--shadow-lg)",
              }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Mobile document sidebar"
            >
              {sidebarContent}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
