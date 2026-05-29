export const SAVED_NOTES_STORAGE_KEY = "rag_saved_notes";

const MAX_TITLE_LENGTH = 72;
const MAX_PREVIEW_LENGTH = 180;

export const hashString = (value) => {
  const input = String(value || "");
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
};

export const createStableMessageId = ({
  sessionId,
  pdfId,
  role,
  index,
  question,
  text,
}) =>
  `msg_${hashString(
    [sessionId || "no-session", pdfId || "no-pdf", role || "bot", index, question || "", text || ""].join("|"),
  )}`;

export const truncateText = (value, maxLength) => {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  const trimmed = normalized.slice(0, maxLength).trim();
  return `${trimmed.replace(/\s+\S*$/, "") || trimmed}...`;
};

export const firstMeaningfulSentence = (value) => {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const sentence = normalized.split(/(?<=[.!?])\s+/).find((part) => part.trim().length >= 12);
  return sentence || normalized;
};

export const buildSavedNoteTitle = (question, answer) => {
  const fromQuestion = truncateText(question, MAX_TITLE_LENGTH);
  if (fromQuestion) return fromQuestion;

  const fromAnswer = truncateText(firstMeaningfulSentence(answer), MAX_TITLE_LENGTH);
  if (fromAnswer) return fromAnswer;

  return "Saved answer";
};

export const buildSavedNotePreview = (answer) =>
  truncateText(answer, MAX_PREVIEW_LENGTH) || "No preview available.";

const isValidSavedNote = (note) =>
  note &&
  typeof note.id === "string" &&
  typeof note.messageId === "string" &&
  typeof note.question === "string" &&
  typeof note.answer === "string" &&
  typeof note.createdAt === "string";

export const loadSavedNotes = () => {
  try {
    const raw = window.localStorage.getItem(SAVED_NOTES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidSavedNote);
  } catch (_) {
    return [];
  }
};

export const persistSavedNotes = (notes) => {
  try {
    window.localStorage.setItem(SAVED_NOTES_STORAGE_KEY, JSON.stringify(notes));
  } catch (_) {
    // Bookmarks are an enhancement; storage failures should never break chat.
  }
};
