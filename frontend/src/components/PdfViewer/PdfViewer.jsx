import React from "react";
import { Card, Button } from "react-bootstrap";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import { Document, Page } from "react-pdf";

const PdfViewer = ({
  darkMode,
  currentPdfUrl,
  pageNumber,
  numPages,
  setPageNumber,
  onDocumentLoadSuccess,
}) => {
  return (
    <Card
  className={`glass-card ${
    darkMode
      ? "bg-dark text-light border-secondary"
      : ""
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

          {currentPdfUrl && (
            <div className="d-flex gap-2">
              
              <Button
                variant={darkMode ? "outline-light" : "outline-dark"}
                size="sm"
                disabled={pageNumber <= 1}
                onClick={() => setPageNumber(pageNumber - 1)}
              >
                Prev
              </Button>

              <Button
                variant={darkMode ? "outline-light" : "outline-dark"}
                size="sm"
                disabled={pageNumber >= numPages}
                onClick={() => setPageNumber(pageNumber + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>

        {currentPdfUrl ? (
          <div style={{ textAlign: "center" }}>
            
            <Document
              file={currentPdfUrl}
              onLoadSuccess={onDocumentLoadSuccess}
            >
              <Page pageNumber={pageNumber} />
            </Document>

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
    Upload a PDF document to preview it here,
    navigate pages, and interact with the AI assistant
    through intelligent document-based conversations.
  </p>
</div>
        )}
      </Card.Body>
    </Card>
  );
};

export default PdfViewer;