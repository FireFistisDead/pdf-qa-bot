import React from "react";
import { Toaster } from "react-hot-toast";

export default function ToastConfig() {
  return (
    <Toaster
      position="top-right"
      gutter={12}
      toastOptions={{
        duration: 3500,
        style: {
          background: "var(--bg-secondary)",
          color: "var(--text-primary)",
          border: "1px solid var(--border-color)",
          borderRadius: "var(--radius-md)",
          padding: "14px 18px",
          fontSize: 14,
          fontWeight: 500,
          boxShadow: "var(--shadow-md)",
          backdropFilter: "blur(12px)",
        },
        success: {
          iconTheme: { primary: "var(--accent)", secondary: "#fff" },
        },
        error: {
          iconTheme: { primary: "var(--error)", secondary: "#fff" },
        },
      }}
    />
  );
}
