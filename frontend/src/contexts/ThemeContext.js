import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

const ThemeContext = createContext();

export const THEMES = {
  dark: {
    "--bg-primary": "#0F172A",
    "--bg-secondary": "#111827",
    "--bg-tertiary": "#1E293B",
    "--bg-card": "rgba(30, 41, 59, 0.6)",
    "--bg-card-hover": "rgba(30, 41, 59, 0.8)",
    "--bg-elevated": "rgba(255,255,255,0.05)",
    "--bg-glass": "rgba(255,255,255,0.04)",
    "--text-primary": "#F1F5F9",
    "--text-secondary": "#94A3B8",
    "--text-tertiary": "#64748B",
    "--text-inverse": "#0F172A",
    "--border-color": "rgba(255,255,255,0.08)",
    "--border-hover": "rgba(255,255,255,0.12)",
    "--accent": "#6366F1",
    "--accent-secondary": "#8B5CF6",
    "--accent-tertiary": "#06B6D4",
    "--accent-gradient": "linear-gradient(135deg, #6366F1, #8B5CF6)",
    "--shadow-sm": "0 1px 3px rgba(0,0,0,0.3)",
    "--shadow-md": "0 8px 32px rgba(0,0,0,0.3)",
    "--shadow-lg": "0 16px 48px rgba(0,0,0,0.4)",
    "--shadow-glow": "0 0 24px rgba(99,102,241,0.15)",
    "--success": "#22C55E",
    "--warning": "#F59E0B",
    "--error": "#EF4444",
    "--info": "#3B82F6",
    "--sidebar-width": "280px",
    "--sidebar-collapsed-width": "72px",
    "--topbar-height": "64px",
    "--radius-sm": "8px",
    "--radius-md": "12px",
    "--radius-lg": "16px",
    "--radius-xl": "24px",
    "--transition-fast": "0.15s ease",
    "--transition-base": "0.25s ease",
    "--transition-slow": "0.35s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  light: {
    "--bg-primary": "#FFFFFF",
    "--bg-secondary": "#F8FAFC",
    "--bg-tertiary": "#F1F5F9",
    "--bg-card": "rgba(255,255,255,0.7)",
    "--bg-card-hover": "rgba(255,255,255,0.9)",
    "--bg-elevated": "rgba(0,0,0,0.03)",
    "--bg-glass": "rgba(255,255,255,0.6)",
    "--text-primary": "#0F172A",
    "--text-secondary": "#475569",
    "--text-tertiary": "#94A3B8",
    "--text-inverse": "#F1F5F9",
    "--border-color": "rgba(0,0,0,0.08)",
    "--border-hover": "rgba(0,0,0,0.12)",
    "--accent": "#6366F1",
    "--accent-secondary": "#8B5CF6",
    "--accent-tertiary": "#06B6D4",
    "--accent-gradient": "linear-gradient(135deg, #6366F1, #8B5CF6)",
    "--shadow-sm": "0 1px 3px rgba(0,0,0,0.06)",
    "--shadow-md": "0 8px 32px rgba(0,0,0,0.06)",
    "--shadow-lg": "0 16px 48px rgba(0,0,0,0.08)",
    "--shadow-glow": "0 0 24px rgba(99,102,241,0.10)",
    "--success": "#22C55E",
    "--warning": "#F59E0B",
    "--error": "#EF4444",
    "--info": "#3B82F6",
    "--sidebar-width": "280px",
    "--sidebar-collapsed-width": "72px",
    "--topbar-height": "64px",
    "--radius-sm": "8px",
    "--radius-md": "12px",
    "--radius-lg": "16px",
    "--radius-xl": "24px",
    "--transition-fast": "0.15s ease",
    "--transition-base": "0.25s ease",
    "--transition-slow": "0.35s cubic-bezier(0.16, 1, 0.3, 1)",
  },
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("pdfqa_theme") || "dark";
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    const vars = THEMES[theme];
    const root = document.documentElement;
    Object.entries(vars).forEach(([key, val]) => {
      root.style.setProperty(key, val);
    });
    root.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("pdfqa_theme", theme);
    } catch {
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
