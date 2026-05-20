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
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";

const Navbar = ({ darkMode, setDarkMode }) => {
  return (
    <AppBar
      position="static"
      elevation={0}
      sx={{
        background: darkMode ? "#0B0B0F" : "#ffffff",
        borderBottom: darkMode
          ? "1px solid rgba(255,255,255,0.08)"
          : "1px solid rgba(0,0,0,0.08)",
        px: 2,
        py: 1,
      }}
    >
      <Toolbar sx={{ display: "flex", justifyContent: "space-between" }}>
        
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          
          <Avatar
            sx={{
              bgcolor: "#7C4DFF",
              width: 48,
              height: 48,
            }}
          >
            <PictureAsPdfIcon />
          </Avatar>

          <Box>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 700,
                color: darkMode ? "#fff" : "#111",
              }}
            >
              PDF Intelligence
            </Typography>

            <Typography
              variant="body2"
              sx={{
                color: darkMode ? "#A1A1AA" : "#666",
              }}
            >
              AI-Powered Document Assistant
            </Typography>
          </Box>
        </Box>

        <IconButton
          onClick={() => setDarkMode(!darkMode)}
          sx={{
            color: darkMode ? "#fff" : "#111",
            border: darkMode
              ? "1px solid rgba(255,255,255,0.1)"
              : "1px solid rgba(0,0,0,0.1)",
            borderRadius: "12px",
          }}
        >
          {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
        </IconButton>
      </Toolbar>
    </AppBar>
  );
};

export default Navbar;