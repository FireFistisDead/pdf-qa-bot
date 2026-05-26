import React, { useEffect, useRef, useState } from "react";
import { Card, Button, Form } from "react-bootstrap";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import { Document, Page, pdfjs } from "react-pdf";

// Set PDF.js worker to local file
pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.min.mjs`;

const PdfViewer = ({ darkMode, currentPdfFile, currentPdfUrl, jumpTarget, heatmapData = {} }) => {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [loadError, setLoadError] = useState("");
  const [heatmapEnabled, setHeatmapEnabled] = useState(true);
  const [isPulsing, setIsPulsing] = useState(false);
  const viewerRef = useRef(null);

  const pdfSource = currentPdfFile || currentPdfUrl;

  // Reset viewer state when PDF changes
  useEffect(() => {
    setPageNumber(1);
    setNumPages(null);
    setLoadError("");
  }, [pdfSource]);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    const requestedPage = Number(jumpTarget?.page);
    setPageNumber(
      Number.isFinite(requestedPage)
        ? Math.min(Math.max(requestedPage, 1), numPages)
        : 1,
    );
    setLoadError("");
  };

  useEffect(() => {
    if (!jumpTarget?.page || loadError) {
      return;
    }

    const requestedPage = Number(jumpTarget.page);
    if (!Number.isFinite(requestedPage)) {
      return;
    }

    const nextPage = numPages
      ? Math.min(Math.max(requestedPage, 1), numPages)
      : Math.max(requestedPage, 1);

    setPageNumber(nextPage);
    viewerRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    
    // Trigger pulse effect
    setIsPulsing(true);
    const timer = setTimeout(() => setIsPulsing(false), 2000);
    return () => clearTimeout(timer);
  }, [jumpTarget, numPages, loadError]);

  const handleLoadError = (error) => {
    console.error("PDF preview failed:", error);

    setLoadError(
      "Preview unavailable for this PDF. The document was uploaded successfully, so chat and summarization can still use it.",
    );
  };

  const getHeatmapStyle = (intensity) => {
    if (!intensity || intensity <= 0) return null;
    const hue = 60 - (intensity * 45); 
    const alpha = 0.1 + (intensity * 0.25);
    return {
      position: "absolute",
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: `hsla(${hue}, 100%, 50%, ${alpha})`,
      pointerEvents: "none",
      zIndex: 10,
      transition: "background-color 0.5s ease"
    };
  };

  return (
    <Card
      ref={viewerRef}
      className={`glass-card ${
        darkMode ? "bg-dark text-light border-secondary" : ""
      }`}
      style={{
        borderRadius: "24px",
        minHeight: "650px",
        border: darkMode
          ? "1px solid rgba(255,255,255,0.08)"
          : "1px solid rgba(0,0,0,0.08)",
        overflow: "hidden",
      }}
    >
      <Card.Body>
        <div
          className="d-flex justify-content-between align-items-center mb-4 pb-3"
          style={{
            borderBottom: darkMode
              ? "1px solid rgba(255,255,255,0.06)"
              : "1px solid rgba(0,0,0,0.06)",
          }}
        >
          <div className="d-flex align-items-center gap-3">
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "14px",

                background: darkMode
                  ? "rgba(139,92,246,0.14)"
                  : "rgba(139,92,246,0.10)",

                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <PictureAsPdfIcon
                sx={{
                  color: "#8B5CF6",
                  fontSize: 22,
                }}
              />
            </div>

            <div>
              <h5
                className="mb-0"
                style={{
                  fontWeight: 700,
                }}
              >
                PDF Preview
              </h5>

              <small
                style={{
                  color: darkMode ? "#A1A1AA" : "#666",
                }}
              >
                Intelligent document workspace
              </small>
            </div>
          </div>

          {pdfSource && (
            <div className="d-flex gap-2">
              <Button
                variant={darkMode ? "outline-light" : "outline-dark"}
                size="sm"
                disabled={pageNumber <= 1 || Boolean(loadError)}
                onClick={() => setPageNumber(pageNumber - 1)}
              >
                Prev
              </Button>

              <Button
                variant={darkMode ? "outline-light" : "outline-dark"}
                size="sm"
                disabled={
                  !numPages || pageNumber >= numPages || Boolean(loadError)
                }
                onClick={() => setPageNumber(pageNumber + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
        
        {pdfSource && (
          <div className="d-flex justify-content-end mb-3">
            <div className="d-flex align-items-center gap-2">
              <Form.Check 
                type="switch"
                id="heatmap-switch"
                label={
                  <span style={{ fontSize: "13px", color: darkMode ? "#A1A1AA" : "#666" }}>
                    Heatmap
                  </span>
                }
                checked={heatmapEnabled}
                onChange={(e) => setHeatmapEnabled(e.target.checked)}
              />
              {heatmapEnabled && (
                <div className="d-flex align-items-center gap-1" style={{ fontSize: "11px", color: darkMode ? "#A1A1AA" : "#666", marginLeft: "8px" }}>
                  <span>Low</span>
                  <div style={{ width: "12px", height: "12px", background: "hsla(60, 100%, 50%, 0.1)" }}></div>
                  <div style={{ width: "12px", height: "12px", background: "hsla(37, 100%, 50%, 0.22)" }}></div>
                  <div style={{ width: "12px", height: "12px", background: "hsla(15, 100%, 50%, 0.35)" }}></div>
                  <span>High</span>
                </div>
              )}
            </div>
          </div>
        )}

        {pdfSource ? (
          <div style={{ textAlign: "center" }}>
            <Document
              file={pdfSource}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={handleLoadError}
              loading={
                <div style={{ padding: "32px" }}>Loading preview...</div>
              }
              error={
                <div
                  style={{
                    padding: "32px",
                    color: darkMode ? "#FCA5A5" : "#B91C1C",
                    fontWeight: 600,
                  }}
                >
                  {loadError || "Failed to load PDF preview."}
                </div>
              }
            >
              {!loadError && (
                 <div style={{ position: "relative", display: "inline-block" }}>
                   <Page pageNumber={pageNumber} />
                   {heatmapEnabled && heatmapData[pageNumber] > 0 && (
                     <div style={getHeatmapStyle(heatmapData[pageNumber])}></div>
                   )}
                   {isPulsing && (
                     <div className="pulse-overlay" style={{
                       position: "absolute",
                       top: 0, left: 0, right: 0, bottom: 0,
                       pointerEvents: "none",
                       zIndex: 20,
                       boxShadow: "inset 0 0 40px rgba(139,92,246,0.6)",
                       border: "3px solid rgba(139,92,246,0.8)",
                       backgroundColor: "rgba(139,92,246,0.1)",
                     }}></div>
                   )}
                 </div>
              )}
            </Document>

            {!loadError && numPages && (
              <div
                className="mt-4"
                style={{
                  fontSize: "14px",
                  color: darkMode ? "#A1A1AA" : "#666",
                  fontWeight: 500,
                }}
              >
                Page {pageNumber} of {numPages}
              </div>
            )}
          </div>
        ) : (
          <div
            className="d-flex flex-column justify-content-center align-items-center text-center"
            style={{
              minHeight: "520px",
              padding: "40px",
              borderRadius: "28px",

              background: darkMode
                ? "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))"
                : "linear-gradient(180deg, #FFFFFF, #F8FAFC)",

              border: darkMode
                ? "1px solid rgba(255,255,255,0.04)"
                : "1px solid rgba(0,0,0,0.04)",

              backdropFilter: "blur(12px)",
            }}
          >
            <div
              style={{
                width: "90px",
                height: "90px",
                borderRadius: "24px",

                background: darkMode
                  ? "linear-gradient(135deg, rgba(139,92,246,0.22), rgba(124,77,255,0.08))"
                  : "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(124,77,255,0.04))",

                boxShadow: darkMode
                  ? "0 12px 32px rgba(139,92,246,0.18)"
                  : "0 10px 24px rgba(139,92,246,0.12)",

                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "24px",
              }}
            >
              <PictureAsPdfIcon
                sx={{
                  fontSize: 48,
                  color: "#8B5CF6",
                }}
              />
            </div>

            <h3
              style={{
                fontWeight: 700,
                fontSize: "36px",
                letterSpacing: "-0.5px",
                marginBottom: "12px",
              }}
            >
              No PDF Selected
            </h3>

            <p
              style={{
                maxWidth: "420px",
                color: darkMode ? "#A1A1AA" : "#666",
                lineHeight: 1.7,
                fontSize: "15px",
                marginBottom: 0,
              }}
            >
              Upload a PDF document to preview it here, navigate pages, and
              interact with the AI assistant through intelligent document-based
              conversations.
            </p>
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

export default PdfViewer;
