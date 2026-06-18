import React, { useEffect, useRef, useState } from "react";
import { Card } from "react-bootstrap";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { Document, Page, pdfjs } from "react-pdf";

// Set PDF.js worker to local file
pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.min.mjs`;

const IconBtn = ({ darkMode, disabled, onClick, children, ariaLabel }) => (
  <button
    type="button"
    aria-label={ariaLabel}
    disabled={disabled}
    onClick={onClick}
    style={{
      width: 36,
      height: 36,
      borderRadius: "10px",
      border: darkMode ? "1px solid rgba(255,255,255,0.14)" : "1px solid rgba(0,0,0,0.12)",
      background: darkMode ? "rgba(255,255,255,0.04)" : "#fff",
      color: darkMode ? "#fff" : "#111",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: disabled ? "default" : "pointer",
      opacity: disabled ? 0.4 : 1,
    }}
  >
    {children}
  </button>
);

const PdfViewer = ({ darkMode, currentPdfFile, currentPdfUrl, jumpTarget }) => {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [loadError, setLoadError] = useState("");
  const [pageWidth, setPageWidth] = useState(undefined);
  const viewerRef = useRef(null);
  const containerRef = useRef(null);

  const pdfSource = currentPdfFile || currentPdfUrl;

  // Reset viewer state when PDF changes
  useEffect(() => {
    setPageNumber(1);
    setNumPages(null);
    setLoadError("");
  }, [pdfSource]);

  // Track container width so the rendered page fits the card on any screen size
  useEffect(() => {
    if (!containerRef.current) return;
    const updateWidth = () => {
      if (containerRef.current) {
        setPageWidth(Math.min(containerRef.current.offsetWidth, 760));
      }
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
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
  }, [jumpTarget, numPages, loadError]);

  const handleLoadError = (error) => {
    console.error("PDF preview failed:", error);

    setLoadError(
      "Preview unavailable for this PDF. The document was uploaded successfully, so chat and summarization can still use it.",
    );
  };

  return (
    <Card
      ref={viewerRef}
      className={`glass-card ${
        darkMode ? "bg-dark text-light border-secondary" : ""
      }`}
      style={{
        borderRadius: "24px",
        minHeight: "560px",
        height: "100%",
        border: darkMode
          ? "1px solid rgba(255,255,255,0.08)"
          : "1px solid rgba(0,0,0,0.08)",
        overflow: "hidden",
      }}
    >
      <Card.Body className="d-flex flex-column" style={{ padding: "20px" }}>
        <div
          className="d-flex justify-content-between align-items-center mb-3 pb-3"
          style={{
            borderBottom: darkMode
              ? "1px solid rgba(255,255,255,0.06)"
              : "1px solid rgba(0,0,0,0.06)",
            gap: "12px",
          }}
        >
          <div className="d-flex align-items-center gap-2 gap-sm-3" style={{ minWidth: 0 }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "12px",
                flexShrink: 0,

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
                  fontSize: 20,
                }}
              />
            </div>

            <div style={{ minWidth: 0 }}>
              <h6
                className="mb-0 text-truncate"
                style={{
                  fontWeight: 700,
                  fontSize: "15px",
                }}
              >
                PDF Preview
              </h6>

              <small
                className="d-none d-sm-inline"
                style={{
                  color: darkMode ? "#A1A1AA" : "#666",
                  fontSize: "12px",
                }}
              >
                Intelligent document workspace
              </small>
            </div>
          </div>

          {pdfSource && !loadError && (
            <div className="d-flex align-items-center gap-2" style={{ flexShrink: 0 }}>
              <IconBtn
                darkMode={darkMode}
                ariaLabel="Previous page"
                disabled={pageNumber <= 1}
                onClick={() => setPageNumber(pageNumber - 1)}
              >
                <ChevronLeftIcon sx={{ fontSize: 20 }} />
              </IconBtn>

              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: darkMode ? "#D1D5DB" : "#374151",
                  minWidth: "64px",
                  textAlign: "center",
                }}
              >
                {numPages ? `${pageNumber} / ${numPages}` : "…"}
              </span>

              <IconBtn
                darkMode={darkMode}
                ariaLabel="Next page"
                disabled={!numPages || pageNumber >= numPages}
                onClick={() => setPageNumber(pageNumber + 1)}
              >
                <ChevronRightIcon sx={{ fontSize: 20 }} />
              </IconBtn>
            </div>
          )}
        </div>

        {pdfSource ? (
          <div
            ref={containerRef}
            className="styled-scroll"
            style={{ textAlign: "center", flex: 1, overflowY: "auto" }}
          >
            <Document
              file={pdfSource}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={handleLoadError}
              loading={
                <div className="d-flex flex-column align-items-center justify-content-center" style={{ minHeight: "420px", gap: "14px" }}>
                  <div
                    className={`skeleton ${darkMode ? "" : "light"}`}
                    style={{ width: "100%", maxWidth: "420px", height: "520px", borderRadius: "12px" }}
                  />
                  <span style={{ fontSize: "13px", color: darkMode ? "#A1A1AA" : "#666" }}>
                    Loading preview…
                  </span>
                </div>
              }
              error={
                <div
                  className="d-flex flex-column align-items-center justify-content-center text-center"
                  style={{
                    minHeight: "420px",
                    padding: "32px",
                    color: darkMode ? "#FCA5A5" : "#B91C1C",
                  }}
                >
                  <span style={{ fontWeight: 600, maxWidth: 380 }}>
                    {loadError || "Failed to load PDF preview."}
                  </span>
                </div>
              }
            >
              {!loadError && <Page pageNumber={pageNumber} width={pageWidth} />}
            </Document>
          </div>
        ) : (
          <div
            className="d-flex flex-column justify-content-center align-items-center text-center"
            style={{
              flex: 1,
              minHeight: "420px",
              padding: "32px 24px",
              borderRadius: "20px",

              background: darkMode
                ? "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))"
                : "linear-gradient(180deg, #FFFFFF, #F8FAFC)",

              border: darkMode
                ? "1px solid rgba(255,255,255,0.04)"
                : "1px solid rgba(0,0,0,0.04)",
            }}
          >
            <div
              style={{
                width: "72px",
                height: "72px",
                borderRadius: "20px",

                background: darkMode
                  ? "linear-gradient(135deg, rgba(139,92,246,0.22), rgba(124,77,255,0.08))"
                  : "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(124,77,255,0.04))",

                boxShadow: darkMode
                  ? "0 12px 32px rgba(139,92,246,0.18)"
                  : "0 10px 24px rgba(139,92,246,0.12)",

                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "20px",
              }}
            >
              <PictureAsPdfIcon
                sx={{
                  fontSize: 36,
                  color: "#8B5CF6",
                }}
              />
            </div>

            <h5
              style={{
                fontWeight: 700,
                fontSize: "1.3rem",
                letterSpacing: "-0.3px",
                marginBottom: "10px",
              }}
            >
              No PDF selected
            </h5>

            <p
              style={{
                maxWidth: "360px",
                color: darkMode ? "#A1A1AA" : "#666",
                lineHeight: 1.6,
                fontSize: "14px",
                marginBottom: 0,
              }}
            >
              Upload a document above to preview it here, flip through pages, and
              jump straight to cited passages from the AI assistant.
            </p>
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

export default PdfViewer;
