import React from "react";
import { motion } from "framer-motion";

const dotVariants = {
  initial: { y: 0 },
  animate: (i) => ({
    y: [0, -6, 0],
    transition: {
      duration: 0.6,
      repeat: Infinity,
      delay: i * 0.15,
      ease: "easeInOut",
    },
  }),
};

export default function TypingIndicator() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 0",
      }}
    >
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          custom={i}
          variants={dotVariants}
          initial="initial"
          animate="animate"
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--accent)",
            opacity: 0.6,
          }}
        />
      ))}
    </div>
  );
}
