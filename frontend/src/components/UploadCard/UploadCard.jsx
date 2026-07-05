import React, { useState } from "react";
import toast from "react-hot-toast";

import {
  Box,
  Typography,
  Button,
  Paper,
  CircularProgress,
} from "@mui/material";

import CloudUploadIcon from "@mui/icons-material/CloudUpload";

const UploadCard = ({ darkMode, onUpload, uploading }) => {
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

const handleDragOver = (e) => {
  e.preventDefault();
  setIsDragging(true);
};

const handleDragLeave = () => {
  setIsDragging(false);
};

const isPdfFile = (file) =>
  file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

const handleDrop = (e) => {
  e.preventDefault();
  setIsDragging(false);
  const allDropped = Array.from(e.dataTransfer.files);
  if (allDropped.length === 0) return;

  const validFiles = allDropped.filter(isPdfFile);

  if (validFiles.length === 0) {
    toast.error("Only PDF files are allowed. Please drop a valid PDF document.");
    return;
  }

  if (validFiles.length < allDropped.length) {
    toast.error("Some files were skipped. Only PDF files are accepted.");
  }

  setFiles(validFiles);
};

  const hasSelectedFiles = files.length > 0;

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    setFiles(selectedFiles);
  };

  const handleUpload = async () => {
    if (!hasSelectedFiles) return;

    // Upload files sequentially
    for (const file of files) {
      await onUpload(file);
    }

    // Clear selected files after upload
    setFiles([]);
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
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        sx={{
          border: isDragging
          ? "2px dashed rgba(139,92,246,0.75)"
          : darkMode
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

          transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
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
                Choose PDFs
                <input
                  hidden
                  type="file"
                  multiple
                  accept="application/pdf"
                  onChange={handleFileChange}
                />
              </Button>

              <Button
                variant="contained"
                onClick={handleUpload}
                disabled={uploading || !hasSelectedFiles}
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
                    Processing PDF...
                  </>
                ) : hasSelectedFiles && files.length > 1 ? (
                  "Upload PDFs"
                ) : (
                  "Upload PDF"
                )}
              </Button>
            </Box>

            {hasSelectedFiles && (
              <Typography
                sx={{
                  mt: 2,
                  color: darkMode ? "#E5E7EB" : "#333",
                  fontSize: "14px",
                }}
              >
                Selected:{" "}
                {files.map((selectedFile) => selectedFile.name).join(", ")}
              </Typography>
            )}
          </Box>
        </Box>
      </Box>
    </Paper>
  );
};

export default UploadCard;
