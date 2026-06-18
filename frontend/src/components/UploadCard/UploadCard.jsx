import React, { useRef, useState } from "react";

import {
  Box,
  Typography,
  Button,
  Paper,
  CircularProgress,
  Chip,
  Stack,
} from "@mui/material";

import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import CloseIcon from "@mui/icons-material/Close";

const formatFileSize = (bytes) => {
  if (!bytes) return "0 KB";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

const UploadCard = ({ darkMode, onUpload, uploading }) => {
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = (e) => {
    e.preventDefault();
    dragCounter.current += 1;
    setIsDragging(true);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      (file) => file.type === "application/pdf"
    );
    if (droppedFiles.length > 0) {
      setFiles((prev) => [...prev, ...droppedFiles]);
    }
  };

  const hasSelectedFiles = files.length > 0;

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      setFiles((prev) => [...prev, ...selectedFiles]);
    }
    // allow re-selecting the same file again later
    e.target.value = "";
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
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
        p: { xs: 2, sm: 3, md: 4 },
        mb: { xs: 2.5, md: 3 },
        borderRadius: { xs: "18px", md: "24px" },

        background: darkMode
          ? "linear-gradient(145deg, #111827, #0B1120)"
          : "#ffffff",

        border: darkMode
          ? "1px solid rgba(255,255,255,0.08)"
          : "1px solid rgba(0,0,0,0.08)",
      }}
    >
      <Box
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        sx={{
          border: isDragging
            ? "2px dashed rgba(139,92,246,0.85)"
            : darkMode
            ? "2px dashed rgba(255,255,255,0.12)"
            : "2px dashed rgba(0,0,0,0.12)",

          position: "relative",
          overflow: "hidden",

          background: isDragging
            ? darkMode
              ? "rgba(139,92,246,0.07)"
              : "rgba(139,92,246,0.04)"
            : "transparent",

          "&:hover": {
            border: darkMode
              ? "2px dashed rgba(139,92,246,0.75)"
              : "2px dashed rgba(139,92,246,0.45)",

            boxShadow: darkMode
              ? "0 0 40px rgba(139,92,246,0.16)"
              : "0 0 30px rgba(139,92,246,0.10)",
          },

          borderRadius: "18px",

          p: { xs: 2.5, sm: 3, md: 4 },

          textAlign: "center",

          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",

            gap: { xs: 2, sm: 3 },

            flexDirection: { xs: "column", sm: "row" },
            flexWrap: "nowrap",

            textAlign: { xs: "center", sm: "left" },
          }}
        >
          <Box
            sx={{
              width: { xs: "56px", sm: "64px", md: "72px" },
              height: { xs: "56px", sm: "64px", md: "72px" },
              borderRadius: "20px",
              flexShrink: 0,

              display: "flex",
              alignItems: "center",
              justifyContent: "center",

              background: darkMode
                ? "rgba(139,92,246,0.10)"
                : "rgba(124,77,255,0.08)",

              border: darkMode
                ? "1px solid rgba(255,255,255,0.08)"
                : "1px solid rgba(124,77,255,0.12)",

              transition: "transform 0.3s ease",
              transform: isDragging ? "scale(1.08)" : "scale(1)",
            }}
          >
            <CloudUploadIcon
              sx={{
                fontSize: { xs: 28, sm: 32, md: 36 },
                color: "#8B5CF6",
              }}
            />
          </Box>

          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: { xs: "center", sm: "flex-start" },
              width: "100%",
              minWidth: 0,
            }}
          >
            <Typography
              sx={{
                fontWeight: 700,
                color: darkMode ? "#fff" : "#111",
                fontSize: { xs: "1.05rem", sm: "1.2rem", md: "1.35rem" },
                mb: 0.4,
              }}
            >
              Drop your PDF here, or browse
            </Typography>

            <Typography
              sx={{
                color: darkMode ? "#A1A1AA" : "#666",
                fontSize: { xs: "0.82rem", sm: "0.9rem" },
                mb: 2.5,
              }}
            >
              Supports a single file or multiple PDFs, up to 20MB each
            </Typography>

            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              sx={{ width: { xs: "100%", sm: "auto" } }}
            >
              <Button
                variant="outlined"
                component="label"
                sx={{
                  borderRadius: "12px",
                  borderColor: darkMode
                    ? "rgba(255,255,255,0.16)"
                    : "rgba(0,0,0,0.14)",
                  color: darkMode ? "#fff" : "#111",
                  px: 3,
                  py: 1.1,
                  textTransform: "none",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  "&:hover": {
                    borderColor: "#8B5CF6",
                    background: darkMode
                      ? "rgba(139,92,246,0.08)"
                      : "rgba(139,92,246,0.05)",
                  },
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
                  borderRadius: "12px",
                  px: 4,
                  py: 1.1,
                  textTransform: "none",
                  fontWeight: 700,
                  minWidth: "170px",
                  whiteSpace: "nowrap",
                  boxShadow: "0 12px 28px rgba(139,92,246,0.28)",
                  "&:hover": {
                    background: "#7C4DFF",
                  },
                  "&.Mui-disabled": {
                    background: darkMode
                      ? "rgba(255,255,255,0.08)"
                      : "rgba(0,0,0,0.08)",
                    color: darkMode
                      ? "rgba(255,255,255,0.3)"
                      : "rgba(0,0,0,0.3)",
                    boxShadow: "none",
                  },
                }}
              >
                {uploading ? (
                  <>
                    <CircularProgress size={18} sx={{ color: "#fff", mr: 1.2 }} />
                    Uploading…
                  </>
                ) : hasSelectedFiles && files.length > 1 ? (
                  `Upload ${files.length} PDFs`
                ) : (
                  "Upload PDF"
                )}
              </Button>
            </Stack>

            {hasSelectedFiles && (
              <Stack
                direction="row"
                spacing={1}
                useFlexGap
                flexWrap="wrap"
                sx={{ mt: 2.5, width: "100%", justifyContent: { xs: "center", sm: "flex-start" } }}
              >
                {files.map((file, index) => (
                  <Chip
                    key={`${file.name}-${index}`}
                    icon={
                      <PictureAsPdfIcon
                        sx={{ fontSize: 16, color: "#8B5CF6 !important" }}
                      />
                    }
                    label={
                      <Box component="span" sx={{ fontSize: "0.78rem" }}>
                        {file.name}{" "}
                        <Box
                          component="span"
                          sx={{ opacity: 0.6, fontSize: "0.7rem" }}
                        >
                          · {formatFileSize(file.size)}
                        </Box>
                      </Box>
                    }
                    onDelete={uploading ? undefined : () => removeFile(index)}
                    deleteIcon={<CloseIcon sx={{ fontSize: 15 }} />}
                    sx={{
                      borderRadius: "10px",
                      background: darkMode
                        ? "rgba(255,255,255,0.06)"
                        : "rgba(0,0,0,0.05)",
                      color: darkMode ? "#E5E7EB" : "#333",
                      maxWidth: { xs: "100%", sm: 280 },
                      animation: "fadeSlideUp 0.25s ease",
                    }}
                  />
                ))}
              </Stack>
            )}
          </Box>
        </Box>
      </Box>
    </Paper>
  );
};

export default UploadCard;
