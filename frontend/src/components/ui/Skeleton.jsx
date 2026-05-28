import React from "react";
import { motion } from "framer-motion";

const shimmer = {
  background: "linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-elevated) 50%, var(--bg-tertiary) 75%)",
  backgroundSize: "200% 100%",
  animation: "shimmer 1.5s ease-in-out infinite",
};

export function SkeletonText({ width = "100%", height = 14, style }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: "var(--radius-sm)",
        ...shimmer,
        ...style,
      }}
      role="presentation"
      aria-hidden="true"
    />
  );
}

export function SkeletonAvatar({ size = 40 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        ...shimmer,
      }}
      role="presentation"
      aria-hidden="true"
    />
  );
}

export function SkeletonCard({ height = 120, style }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        borderRadius: "var(--radius-lg)",
        background: "var(--bg-card)",
        border: "1px solid var(--border-color)",
        height,
        ...shimmer,
        ...style,
      }}
      role="presentation"
      aria-hidden="true"
    />
  );
}

export function ChatSkeleton() {
  return (
    <div
      style={{
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
      role="presentation"
      aria-label="Loading chat messages"
    >
      {[1, 2, 3].map((i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: i % 2 === 0 ? 20 : -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.1, duration: 0.3 }}
          style={{
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
            flexDirection: i % 2 === 0 ? "row-reverse" : "row",
          }}
        >
          <SkeletonAvatar size={32} />
          <div style={{ flex: 1, maxWidth: "70%" }}>
            <SkeletonText
              width={i % 2 === 0 ? "60%" : "80%"}
              height={12}
              style={{ marginBottom: 8 }}
            />
            <SkeletonText
              width={i % 2 === 0 ? "80%" : "60%"}
              height={12}
              style={{ marginBottom: 8 }}
            />
            <SkeletonText width="40%" height={12} />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

export function SidebarSkeleton() {
  return (
    <div
      style={{
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
      role="presentation"
      aria-label="Loading sidebar"
    >
      <SkeletonText width="60%" height={20} style={{ marginBottom: 16 }} />
      {[1, 2, 3, 4, 5].map((i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 0",
          }}
        >
          <SkeletonAvatar size={28} />
          <SkeletonText width={`${50 + (i * 7) % 30}%`} height={12} />
        </motion.div>
      ))}
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 16,
      }}
      role="presentation"
      aria-label="Loading statistics"
    >
      {[1, 2, 3, 4].map((i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          style={{
            borderRadius: "var(--radius-lg)",
            padding: 24,
            background: "var(--bg-card)",
            border: "1px solid var(--border-color)",
            ...shimmer,
          }}
        >
          <SkeletonText width="40%" height={32} style={{ marginBottom: 8 }} />
          <SkeletonText width="60%" height={14} />
        </motion.div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div
      style={{
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
      role="presentation"
      aria-label="Loading dashboard"
    >
      <SkeletonText width="40%" height={28} />
      <StatsSkeleton />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <SkeletonCard height={300} />
        <SkeletonCard height={300} />
      </div>
    </div>
  );
}
