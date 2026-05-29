import React from "react";
import { Button } from "react-bootstrap";
import Papa from "papaparse";
import { saveAs } from "file-saver";

const ExportMenu = ({ currentChat, selectedPdfName }) => {
  const exportChat = (type) => {
    if (!selectedPdfName || !currentChat || currentChat.length === 0) return;

    if (type === "csv") {
      const csv = Papa.unparse(currentChat);
      const blob = new Blob([csv], { type: "text/csv" });
      saveAs(blob, `${selectedPdfName}-chat.csv`);
    } else if (type === "pdf") {
      const text = currentChat.map((msg) => `${msg.role}: ${msg.text}`).join("\n\n");
      const blob = new Blob([text], { type: "application/pdf" });
      saveAs(blob, `${selectedPdfName}-chat.pdf`);
    }
  };

  return (
    <div className="d-flex gap-2">
      {/* Export as PDF */}
      <Button
        variant="outline-secondary"
        size="sm"
        onClick={() => exportChat("pdf")}
        disabled={!selectedPdfName || !currentChat || currentChat.length === 0}
      >
        Export as PDF
      </Button>

      {/* Export as CSV */}
      <Button
        variant="outline-secondary"
        size="sm"
        onClick={() => exportChat("csv")}
        disabled={!selectedPdfName || !currentChat || currentChat.length === 0}
      >
        Export as CSV
      </Button>
    </div>
  );
};

export default ExportMenu;
