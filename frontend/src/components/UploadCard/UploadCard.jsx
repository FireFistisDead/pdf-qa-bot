import React, { useState } from "react";

import {
  Box,
  Typography,
  Button,
  Paper,
  CircularProgress,
} from "@mui/material";

import CloudUploadIcon from "@mui/icons-material/CloudUpload";

const UploadCard = ({
  darkMode,
  onUpload,
  uploading,
}) => {
  const [file, setFile] = useState(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleUpload = () => {
    if (file) {
      onUpload(file);
      // Wait for parent to handle clear or success, but we can clear it on success if we want,
      // or let user upload again.
    }
  };

  return (
    <Paper
      elevation={0}
      sx={{
        p: 4,
        mb: 4,
        borderRadius: "24px",
        background: darkMode
          ? "linear-gradient(145deg, #111827, #0B1120)"
          : "#ffffff",
        border: darkMode
          ? "1px solid rgba(255,255,255,0.08)"
          : "1px solid rgba(0,0,0,0.08)",
      }}
    >
      <Box
        sx={{
          border: darkMode
            ? "2px dashed rgba(255,255,255,0.12)"
            : "2px dashed rgba(0,0,0,0.12)",
            position: "relative",
overflow: "hidden",

"&:hover": {
  border: darkMode
    ? "2px dashed rgba(139,92,246,0.75)"
    : "2px dashed rgba(139,92,246,0.45)",

  boxShadow: darkMode
    ? "0 0 40px rgba(139,92,246,0.16)"
    : "0 0 30px rgba(139,92,246,0.10)",

  background: darkMode
    ? "rgba(139,92,246,0.03)"
    : "rgba(139,92,246,0.02)",

  transform: "translateY(-2px)",
},
          borderRadius: "20px",
          p: {
  xs: 3,
  md: 5,
},
          textAlign: "center",
         transition:
  "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <Box
  sx={{
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 4,
    flexWrap: {
  xs: "wrap",
  md: "nowrap",
},
    px: 4,
    py: 2,
  }}
>
  <Box
    sx={{
      width: "72px",
      height: "72px",
      borderRadius: "22px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: darkMode
        ? "rgba(255,255,255,0.04)"
        : "rgba(124,77,255,0.08)",
      border: darkMode
        ? "1px solid rgba(255,255,255,0.08)"
        : "1px solid rgba(124,77,255,0.12)",
    }}
  >
    <CloudUploadIcon
      sx={{
        fontSize: 38,
        color: "#8B5CF6",
      }}
    />
  </Box>

  <Box
    sx={{
      display: "flex",
      flexDirection: "column",
      alignItems: {
        xs: "center",
        md: "flex-start",
      },
      textAlign: {
        xs: "center",
        md: "left",
      },
    }}
  >
    <Typography
      variant="h5"
      sx={{
        fontWeight: 700,
        color: darkMode ? "#fff" : "#111",
        mb: 0.5,
      }}
    >
      Click to upload or drag and drop
    </Typography>

    <Typography
      variant="body1"
      sx={{
        color: darkMode ? "#A1A1AA" : "#666",
        mb: 3,
      }}
    >
      PDF documents up to 20MB
    </Typography>

    <Box
      sx={{
        display: "flex",
        gap: 2,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <Button
        variant="contained"
        component="label"
        sx={{
          background: "#8B5CF6",
          borderRadius: "14px",
          px: 4,
          py: 1.3,
          textTransform: "none",
          fontWeight: 700,
          boxShadow: "0 10px 30px rgba(139,92,246,0.22)",

          "&:hover": {
            background: "#7C4DFF",
            transform: "translateY(-1px)",
          },

          transition: "all 0.25s ease",
        }}
      >
        Choose File

        <input
          hidden
          type="file"
          accept="application/pdf"
          onChange={handleFileChange}
        />
      </Button>

      <Button
        variant="contained"
        onClick={handleUpload}
        disabled={uploading || !file}
        sx={{
          background: "#8B5CF6",
          color: "#fff",
          borderRadius: "14px",
          px: 5,
          py: 1.3,
          textTransform: "none",
          fontWeight: 700,
          minWidth: "190px",
          boxShadow: "0 14px 34px rgba(139,92,246,0.32)",

          "&:hover": {
            background: "#7C4DFF",
            transform: "translateY(-1px)",
          },

          "&.Mui-disabled": {
            background: darkMode
              ? "rgba(255,255,255,0.08)"
              : "rgba(0,0,0,0.08)",
            color: darkMode
              ? "rgba(255,255,255,0.3)"
              : "rgba(0,0,0,0.3)",
          },

          transition: "all 0.25s ease",
        }}
      >
        {uploading ? (
          <>
            <CircularProgress
              size={20}
              sx={{
                color: "#fff",
                mr: 1,
              }}
            />
            Uploading...
          </>
        ) : (
          "Upload PDF"
        )}
      </Button>
    </Box>

    {file && (
      <Typography
        sx={{
          mt: 2,
          color: darkMode ? "#E5E7EB" : "#333",
          fontSize: "14px",
        }}
      >
        Selected: {file.name}
      </Typography>
    )}
  </Box>
</Box>
      </Box>
    </Paper>
  );
};

export default UploadCard;