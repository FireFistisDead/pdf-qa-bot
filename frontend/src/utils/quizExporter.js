import { jsPDF } from "jspdf";
import { saveAs } from "file-saver";

/**
 * Parses markdown-style quiz text and converts it to HTML for Word export.
 */
const parseMarkdownToHtml = (markdown) => {
  return markdown
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return "<br/>";
      }

      // Headers
      if (line.startsWith("# ")) {
        return `<h1>${line.substring(2)}</h1>`;
      }
      if (line.startsWith("## ")) {
        return `<h2>${line.substring(3)}</h2>`;
      }

      // Question line (e.g., "1. **Question:** What is...")
      if (trimmed.match(/^\d+\./)) {
        const formatted = trimmed.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        return `<p class="question" style="font-size: 14pt; font-weight: bold; margin-top: 18pt; margin-bottom: 6pt; color: #1e293b;">${formatted}</p>`;
      }

      // Option line (e.g., "- A) Option text")
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        const optionText = trimmed.substring(2);
        return `<p class="option" style="font-size: 11pt; margin-left: 20pt; margin-top: 3pt; margin-bottom: 3pt; color: #4b5563;">${optionText}</p>`;
      }

      // Correct Answer line
      if (trimmed.includes("Correct Answer:")) {
        const formatted = trimmed.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        return `<p class="answer" style="font-size: 11pt; font-weight: bold; margin-left: 20pt; margin-top: 4pt; margin-bottom: 12pt; color: #10b981;">${formatted}</p>`;
      }

      // Default line formatting
      const formatted = trimmed.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
      return `<p style="font-size: 11pt; margin-top: 6pt; margin-bottom: 6pt; color: #1f2937;">${formatted}</p>`;
    })
    .join("\n");
};

/**
 * Generates and downloads a Word Document (.doc) from the markdown quiz text.
 */
export const exportQuizToWord = (quizText, filenamePrefix = "quiz") => {
  const parsedHtml = parseMarkdownToHtml(quizText);
  
  const header = `
    <html xmlns:o='urn:schemas-microsoft-xml-office:office' xmlns:w='urn:schemas-microsoft-xml-office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset="utf-8">
      <title>AI Generated Quiz</title>
      <style>
        body {
          font-family: 'Segoe UI', Arial, sans-serif;
          line-height: 1.5;
          color: #1f2937;
          margin: 1in;
        }
        h1 {
          font-size: 24pt;
          color: #8b5cf6;
          border-bottom: 2px solid #e5e7eb;
          padding-bottom: 6pt;
          margin-top: 0;
          margin-bottom: 18pt;
        }
        h2 {
          font-size: 16pt;
          color: #4b5563;
          margin-top: 24pt;
          margin-bottom: 12pt;
        }
      </style>
    </head>
    <body>
      ${parsedHtml}
    </body>
    </html>
  `.trim();

  const blob = new Blob([header], { type: "application/msword;charset=utf-8" });
  const filename = `${filenamePrefix.replace(/\s+/g, "_")}_quiz.doc`;
  saveAs(blob, filename);
};

/**
 * Generates and downloads a beautifully styled PDF from the markdown quiz text.
 */
export const exportQuizToPdf = (quizText, filenamePrefix = "quiz") => {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const lines = quizText.split("\n");
  let y = 25; // Vertical cursor
  const pageHeight = doc.internal.pageSize.height;
  const margin = 20;
  const contentWidth = doc.internal.pageSize.width - 2 * margin;

  // Header styling
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(139, 92, 246); // Brand purple color

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      y += 4;
      return;
    }

    let text = trimmed;
    let isTitle = false;
    let isQuestion = false;
    let isOption = false;
    let isAnswer = false;

    if (line.startsWith("# ")) {
      isTitle = true;
      text = line.substring(2);
    } else if (trimmed.match(/^\d+\./)) {
      isQuestion = true;
      text = trimmed.replace(/\*\*/g, ""); // Remove bold markdown formatting
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      isOption = true;
      text = "   \u2022 " + trimmed.substring(2); // Bullet list format
    } else if (trimmed.includes("Correct Answer:")) {
      isAnswer = true;
      text = "    " + trimmed.replace(/\*\*/g, ""); // Indented answer line
    } else {
      text = trimmed.replace(/\*\*/g, "");
    }

    // Set font style and size based on the type of line
    if (isTitle) {
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(20);
      doc.setTextColor(139, 92, 246);
    } else if (isQuestion) {
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(30, 41, 59); // Slate-800
      y += 4; // Extra spacing before a question
    } else if (isOption) {
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(75, 85, 99); // Gray-600
    } else if (isAnswer) {
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(16, 185, 129); // Green-500
    } else {
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(31, 41, 55); // Gray-800
    }

    // Wrap text to fit page width
    const splitText = doc.splitTextToSize(text, contentWidth);
    
    splitText.forEach((textLine) => {
      // Check for page break
      if (y > pageHeight - margin) {
        doc.addPage();
        y = 25; // Reset top margin for new page
      }
      doc.text(textLine, margin, y);
      y += isTitle ? 12 : 7;
    });
  });

  const filename = `${filenamePrefix.replace(/\s+/g, "_")}_quiz.pdf`;
  doc.save(filename);
};
