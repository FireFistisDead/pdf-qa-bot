import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FiPlus, FiUpload, FiFileText } from "react-icons/fi";

function FABItem({ icon, label, onClick, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20, scale: 0.8 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 20, scale: 0.8 }}
      transition={{
        delay,
        type: "spring",
        stiffness: 400,
        damping: 25,
        mass: 0.8,
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexDirection: "row-reverse",
      }}
    >
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.93 }}
        onClick={onClick}
        aria-label={label}
        title={label}
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          border: "none",
          background: "var(--accent-gradient)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: "0 4px 20px rgba(99,102,241,0.3)",
          fontSize: 18,
          position: "relative",
          transition: "box-shadow var(--transition-fast)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = "0 8px 32px rgba(99,102,241,0.45)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = "0 4px 20px rgba(99,102,241,0.3)";
        }}
      >
        {icon}
        <div
          style={{
            position: "absolute",
            inset: -3,
            borderRadius: "50%",
            background: "linear-gradient(135deg, rgba(99,102,241,0.15), transparent)",
            filter: "blur(8px)",
            zIndex: -1,
          }}
        />
      </motion.button>
      <motion.span
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 10 }}
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-primary)",
          background: "var(--bg-card)",
          padding: "6px 12px",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border-color)",
          backdropFilter: "blur(12px)",
          whiteSpace: "nowrap",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {label}
      </motion.span>
    </motion.div>
  );
}

export default function FAB({ onUpload }) {
  const [open, setOpen] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file && onUpload) {
      onUpload(file);
    }
    e.target.value = "";
    setOpen(false);
  };

  return (
    <div
      className="mobile-bottom-fab"
      style={{
        position: "fixed",
        bottom: 28,
        right: 28,
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 14,
      }}
    >
      <AnimatePresence>
        {open && (
          <>
            <FABItem
              icon={<FiUpload />}
              label="Upload PDF"
              delay={0.1}
              onClick={() => fileInputRef.current?.click()}
            />
            <FABItem
              icon={<FiFileText />}
              label="Documents"
              delay={0.05}
              onClick={() => {
                window.location.href = "/dashboard/documents";
                setOpen(false);
              }}
            />
          </>
        )}
      </AnimatePresence>

      <motion.div
        animate={open ? { rotate: 45 } : { rotate: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        style={{ position: "relative" }}
      >
        <motion.button
          whileHover={{
            scale: 1.06,
            boxShadow: "0 12px 40px rgba(99,102,241,0.5)",
          }}
          whileTap={{ scale: 0.93 }}
          onClick={() => setOpen(!open)}
          aria-label={open ? "Close menu" : "Open menu"}
          style={{
            width: 58,
            height: 58,
            borderRadius: "50%",
            border: "none",
            background: "var(--accent-gradient)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            boxShadow: "0 8px 32px rgba(99,102,241,0.35)",
            fontSize: 26,
            position: "relative",
            transition: "box-shadow var(--transition-fast)",
          }}
        >
          <FiPlus />
          <div
            style={{
              position: "absolute",
              inset: -6,
              borderRadius: "50%",
              background: "linear-gradient(135deg, rgba(99,102,241,0.2), transparent)",
              filter: "blur(16px)",
              zIndex: -1,
            }}
          />
        </motion.button>
      </motion.div>

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
}
