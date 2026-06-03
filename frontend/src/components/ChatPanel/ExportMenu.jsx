import React from "react";
import { Button } from "react-bootstrap";
import { saveAs } from "file-saver";

const ExportMenu = ({ currentChat, selectedPdfName }) => {
  const exportChatTxt = () => {
    if (!selectedPdfName || !currentChat || currentChat.length === 0) return;

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const formattedTimestamp = `${yyyy}-${mm}-${dd} ${hh}:${min}`;

    let content = `PDF Q&A Bot — Chat Export\nPDF: ${selectedPdfName}\nExported: ${formattedTimestamp}\n\n---\n\n`;

    currentChat.forEach((msg) => {
      if (msg.role === "user") {
        content += `Q: ${msg.text}\n`;
      } else if (msg.role === "bot") {
        content += `A: ${msg.text}\n\n`;
      }
    });

    const blob = new Blob([content], { type: "text/plain" });
    saveAs(blob, `chat-export-${selectedPdfName}.txt`);
  };

  return (
 feature/export-answers
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

    <Button
      variant="outline-secondary"
      size="sm"
      onClick={exportChatTxt}
      disabled={!selectedPdfName || !currentChat || currentChat.length === 0}
    >
      📥 Export Chat
    </Button>
 master
  );
};

export default ExportMenu;
