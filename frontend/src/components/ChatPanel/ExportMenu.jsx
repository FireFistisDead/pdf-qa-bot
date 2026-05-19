import React from "react";
import { Button } from "react-bootstrap";
import Papa from "papaparse";
import { saveAs } from "file-saver";

const ExportMenu = ({ currentChat, selectedPdf }) => {
  const exportChat = (type) => {
    if (!selectedPdf || !currentChat || currentChat.length === 0) return;

    if (type === "csv") {
      const csv = Papa.unparse(currentChat);
      const blob = new Blob([csv], { type: "text/csv" });
      saveAs(blob, `${selectedPdf}-chat.csv`);
    } else if (type === "pdf") {
      const text = currentChat.map((msg) => `${msg.role}: ${msg.text}`).join("\n\n");
      const blob = new Blob([text], { type: "application/pdf" });
      saveAs(blob, `${selectedPdf}-chat.pdf`);
    }
  };

  return (
    <Button
      variant="outline-secondary"
      size="sm"
      onClick={() => exportChat("pdf")}
      disabled={!selectedPdf || !currentChat || currentChat.length === 0}
    >
      Export
    </Button>
  );
};

export default ExportMenu;
