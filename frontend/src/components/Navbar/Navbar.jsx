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
import logo from "./Nav_logo.png";

const Navbar = ({ darkMode, setDarkMode }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
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
          
          <IconButton 
            onClick={() => navigate('/')}
            sx={{ p: 0 }}
            aria-label="Go to home"
          >
            <Avatar
              src={logo}
              alt="Logo"
              sx={{
                width: 48,
                height: 48,
                bgcolor: "transparent",
              }}
            />
          </IconButton>

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

        <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>

          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                onClick={() => navigate('/dashboard')}
                style={{
                  padding: "8px 16px",
                  borderRadius: "10px",
                  border: "none",
                  background: "#eee",
                  color: "#333",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Dashboard
              </button>
              <button 
                onClick={() => supabase.auth.signOut()}
                style={{
                  background: '#7C4DFF',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                }}
                title="Sign Out"
              >
                {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={() => navigate('/signin')}
                style={{
                  padding: "8px 16px",
                  borderRadius: "10px",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 600,
                  background: 'transparent',
                  color: darkMode ? "#fff" : "#111",
                }}
              >
                Login
              </button>

              <button
                onClick={() => navigate('/signup')}
                style={{
                  padding: "8px 16px",
                  borderRadius: "10px",
                  border: "none",
                  background: "#7C4DFF",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Signup
              </button>
            </>
          )}

          <IconButton
            onClick={() => setDarkMode(!darkMode)}
            aria-label="Toggle dark mode"
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

        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Navbar;