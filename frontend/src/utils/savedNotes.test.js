import {
  SAVED_NOTES_STORAGE_KEY,
  buildSavedNotePreview,
  buildSavedNoteTitle,
  loadSavedNotes,
} from "./savedNotes";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

test("loadSavedNotes returns an empty array for corrupt storage", () => {
  localStorage.setItem(SAVED_NOTES_STORAGE_KEY, "{bad json");

  expect(loadSavedNotes()).toEqual([]);
});

test("loadSavedNotes filters invalid entries", () => {
  const valid = {
    id: "note_1",
    messageId: "msg_1",
    question: "What is RAG?",
    answer: "RAG combines retrieval with generation.",
    createdAt: new Date().toISOString(),
  };

  localStorage.setItem(
    SAVED_NOTES_STORAGE_KEY,
    JSON.stringify([valid, { id: "missing-fields" }]),
  );

  expect(loadSavedNotes()).toEqual([valid]);
});

test("buildSavedNoteTitle prefers question text", () => {
  expect(buildSavedNoteTitle("What is RAG?", "RAG combines retrieval with generation.")).toBe(
    "What is RAG?",
  );
});

test("buildSavedNotePreview safely truncates long answers", () => {
  const preview = buildSavedNotePreview("word ".repeat(80));

  expect(preview.length).toBeLessThanOrEqual(183);
  expect(preview.endsWith("...")).toBe(true);
});
