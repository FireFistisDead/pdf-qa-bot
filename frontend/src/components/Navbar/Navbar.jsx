import React from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Box,
  Avatar,
  Tooltip,
} from "@mui/material";

import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";

const Navbar = ({ darkMode, setDarkMode }) => {
  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        background: darkMode
          ? "rgba(11,11,15,0.85)"
          : "rgba(255,255,255,0.85)",
        backdropFilter: "blur(14px)",
        borderBottom: darkMode
          ? "1px solid rgba(255,255,255,0.08)"
          : "1px solid rgba(0,0,0,0.08)",
        top: 0,
        zIndex: 1100,
      }}
    >
      <Toolbar
        sx={{
          display: "flex",
          justifyContent: "space-between",
          minHeight: { xs: "64px", md: "72px" },
          px: { xs: 1.5, sm: 2, md: 3 },
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 1.25, sm: 2 }, minWidth: 0 }}>
          <Avatar
            sx={{
              bgcolor: "#7C4DFF",
              width: { xs: 38, sm: 44, md: 48 },
              height: { xs: 38, sm: 44, md: 48 },
              boxShadow: "0 8px 20px rgba(124,77,255,0.35)",
              flexShrink: 0,
            }}
          >
            <PictureAsPdfIcon sx={{ fontSize: { xs: 18, sm: 22, md: 24 } }} />
          </Avatar>

          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="h6"
              noWrap
              sx={{
                fontWeight: 800,
                fontSize: { xs: "1.05rem", sm: "1.25rem", md: "1.4rem" },
                letterSpacing: "-0.3px",
                lineHeight: 1.2,
                color: darkMode ? "#fff" : "#111",
              }}
            >
              PDF Intelligence
            </Typography>

            <Typography
              variant="body2"
              noWrap
              sx={{
                display: { xs: "none", sm: "block" },
                fontSize: "0.8rem",
                color: darkMode ? "#A1A1AA" : "#666",
              }}
            >
              AI-powered document assistant
            </Typography>
          </Box>
        </Box>

        <Tooltip title={darkMode ? "Switch to light mode" : "Switch to dark mode"}>
          <IconButton
            onClick={() => setDarkMode(!darkMode)}
            aria-label="Toggle color theme"
            sx={{
              color: darkMode ? "#fff" : "#111",
              border: darkMode
                ? "1px solid rgba(255,255,255,0.1)"
                : "1px solid rgba(0,0,0,0.1)",
              borderRadius: "12px",
              width: { xs: 38, sm: 44 },
              height: { xs: 38, sm: 44 },
              flexShrink: 0,
            }}
          >
            {darkMode ? (
              <LightModeIcon sx={{ fontSize: { xs: 18, sm: 22 } }} />
            ) : (
              <DarkModeIcon sx={{ fontSize: { xs: 18, sm: 22 } }} />
            )}
          </IconButton>
        </Tooltip>
      </Toolbar>
    </AppBar>
  );
};

export default Navbar;
