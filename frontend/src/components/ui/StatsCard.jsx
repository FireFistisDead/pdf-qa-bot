import React from "react";
import { motion } from "framer-motion";

const gradients = {
  purple: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.05))",
  cyan: "linear-gradient(135deg, rgba(6,182,212,0.15), rgba(6,182,212,0.05))",
  green: "linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05))",
  amber: "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.05))",
  rose: "linear-gradient(135deg, rgba(244,63,94,0.15), rgba(244,63,94,0.05))",
};

const iconColors = {
  purple: { bg: "rgba(99,102,241,0.15)", color: "#818CF8" },
  cyan: { bg: "rgba(6,182,212,0.15)", color: "#22D3EE" },
  green: { bg: "rgba(34,197,94,0.15)", color: "#4ADE80" },
  amber: { bg: "rgba(245,158,11,0.15)", color: "#FBBF24" },
  rose: { bg: "rgba(244,63,94,0.15)", color: "#FB7185" },
};

export default function StatsCard({
  label,
  value,
  icon,
  gradient = "purple",
  trend,
  onClick,
}) {
  const bgGrad = gradients[gradient] || gradients.purple;
  const ic = iconColors[gradient] || iconColors.purple;

  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      style={{
        background: bgGrad,
        border: "1px solid var(--border-color)",
        borderRadius: "var(--radius-lg)",
        padding: "24px",
        cursor: onClick ? "pointer" : "default",
        backdropFilter: "blur(12px)",
        position: "relative",
        overflow: "hidden",
        transition: "border-color var(--transition-base)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--accent)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border-color)";
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "32px",
              fontWeight: 700,
              color: "var(--text-primary)",
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
            }}
          >
            {value}
          </div>
          <div
            style={{
              fontSize: "13px",
              color: "var(--text-secondary)",
              fontWeight: 500,
              marginTop: 4,
              letterSpacing: "0.01em",
            }}
          >
            {label}
          </div>
        </div>
        {icon && (
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "var(--radius-md)",
              background: ic.bg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: ic.color,
              flexShrink: 0,
              fontSize: 20,
            }}
          >
            {icon}
          </div>
        )}
      </div>
      {trend && (
        <div
          style={{
            marginTop: 16,
            paddingTop: 12,
            borderTop: "1px solid var(--border-color)",
            fontSize: "12px",
            color: trend > 0 ? "var(--success)" : "var(--error)",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {trend > 0 ? "+" : ""}{trend}% from last month
        </div>
      )}
      <div
        style={{
          position: "absolute",
          top: "-50%",
          right: "-20%",
          width: 120,
          height: 120,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,102,241,0.06), transparent)",
          pointerEvents: "none",
        }}
      />
    </motion.div>
  );
}
