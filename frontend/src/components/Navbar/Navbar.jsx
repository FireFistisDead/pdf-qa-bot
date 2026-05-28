import React from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Box,
  Avatar,
} from "@mui/material";

import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../services/supabaseClient";
import { motion } from "framer-motion";
import { FiSearch, FiCommand } from "react-icons/fi";
import logo from "./Nav_logo.png";

const Navbar = ({ darkMode, setDarkMode, onSearchToggle }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  return (
    <AppBar
      position="static"
      elevation={0}
      sx={{
        background: darkMode ? "var(--bg-secondary)" : "#ffffff",
        borderBottom: "1px solid var(--border-color)",
        px: 2,
        py: 0.5,
      }}
    >
      <Toolbar sx={{ display: "flex", justifyContent: "space-between" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Avatar
            src={logo}
            alt="Logo"
            onClick={() => navigate("/")}
            sx={{
              width: 40,
              height: 40,
              bgcolor: "transparent",
              cursor: "pointer",
            }}
          />
          <Box>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                color: darkMode ? "var(--text-primary)" : "#111",
                fontSize: "1.1rem",
                letterSpacing: "-0.01em",
              }}
            >
              PDF Intelligence
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: darkMode ? "var(--text-tertiary)" : "#666",
                fontSize: "0.7rem",
              }}
            >
              AI-Powered Document Assistant
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
          {/* Search button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onSearchToggle}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-color)",
              background: darkMode ? "var(--bg-tertiary)" : "#f3f4f6",
              color: darkMode ? "var(--text-tertiary)" : "#666",
              cursor: "pointer",
              fontSize: 13,
              fontFamily: "var(--font-sans)",
              transition: "border-color var(--transition-fast)",
            }}
          >
            <FiSearch size={14} />
            <span>Search</span>
            <kbd
              style={{
                padding: "2px 6px",
                borderRadius: 4,
                background: darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                fontSize: 10,
                fontWeight: 600,
                fontFamily: "var(--font-sans)",
                marginLeft: 4,
              }}
            >
              <FiCommand size={10} style={{ display: "inline", verticalAlign: "middle" }} />K
            </kbd>
          </motion.button>

          {user ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate("/dashboard")}
                style={{
                  padding: "8px 16px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-color)",
                  background: "transparent",
                  color: darkMode ? "var(--text-secondary)" : "#333",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 12,
                  fontFamily: "var(--font-sans)",
                  transition: "all var(--transition-fast)",
                }}
              >
                Dashboard
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => supabase.auth.signOut()}
                title={user.email || "Sign Out"}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  border: "1px solid var(--border-color)",
                  background: "var(--accent-gradient)",
                  color: "#fff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: 13,
                  fontFamily: "var(--font-sans)",
                }}
              >
                {user.email ? user.email.charAt(0).toUpperCase() : "U"}
              </motion.button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate("/signin")}
                style={{
                  padding: "8px 16px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-color)",
                  background: "transparent",
                  color: darkMode ? "var(--text-primary)" : "#111",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 12,
                  fontFamily: "var(--font-sans)",
                }}
              >
                Login
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate("/signup")}
                style={{
                  padding: "8px 16px",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background: "var(--accent-gradient)",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 12,
                  fontFamily: "var(--font-sans)",
                }}
              >
                Signup
              </motion.button>
            </div>
          )}

          <IconButton
            onClick={() => setDarkMode(!darkMode)}
            sx={{
              color: darkMode ? "var(--text-primary)" : "#111",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-md)",
              width: 36,
              height: 36,
            }}
          >
            {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Navbar;
