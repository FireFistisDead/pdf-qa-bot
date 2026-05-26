import React from "react";
import { Button, Card } from "react-bootstrap";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

import { buildSavedNotePreview, buildSavedNoteTitle } from "../../utils/savedNotes";

const formatSavedAt = (createdAt) => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(createdAt));
  } catch (_) {
    return "";
  }
};

const SavedNotes = ({
  darkMode,
  notes,
  availableMessageIds,
  onOpenNote,
  onRemoveNote,
}) => {
  const sortedNotes = [...notes].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <Card
      className={`glass-card saved-notes-card ${darkMode ? "bg-dark text-light border-secondary" : ""}`}
      style={{
        borderRadius: "18px",
        marginBottom: "16px",
        border: darkMode
          ? "1px solid rgba(255,255,255,0.08)"
          : "1px solid rgba(0,0,0,0.08)",
      }}
    >
      <Card.Body style={{ padding: "16px" }}>
        <div className="d-flex align-items-center justify-content-between mb-3">
          <div className="d-flex align-items-center gap-2">
            <BookmarkIcon sx={{ color: "#8B5CF6", fontSize: 20 }} />
            <h6 className="mb-0" style={{ fontWeight: 700 }}>
              Saved Notes
            </h6>
          </div>
          <span
            aria-label={`${notes.length} saved responses`}
            style={{
              fontSize: "12px",
              color: darkMode ? "#A1A1AA" : "#666",
              fontWeight: 600,
            }}
          >
            {notes.length}
          </span>
        </div>

        {sortedNotes.length === 0 ? (
          <div
            style={{
              borderRadius: "14px",
              padding: "14px",
              background: darkMode ? "rgba(255,255,255,0.04)" : "#F8FAFC",
              color: darkMode ? "#D1D5DB" : "#4B5563",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: "4px" }}>
              No saved responses yet
            </div>
            <div style={{ fontSize: "13px", lineHeight: 1.5 }}>
              Bookmark important answers to revisit later.
            </div>
          </div>
        ) : (
          <div
            className="saved-notes-list"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              maxHeight: "260px",
              overflowY: "auto",
              paddingRight: "2px",
            }}
          >
            {sortedNotes.map((note) => {
              const isAvailable = availableMessageIds.has(note.messageId);
              return (
                <div
                  key={note.id}
                  className="saved-note-item"
                  style={{
                    borderRadius: "14px",
                    padding: "12px",
                    background: darkMode ? "rgba(255,255,255,0.05)" : "#F8FAFC",
                    border: darkMode
                      ? "1px solid rgba(255,255,255,0.07)"
                      : "1px solid rgba(0,0,0,0.06)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onOpenNote(note)}
                    className="saved-note-open"
                    aria-label={`Open saved note: ${buildSavedNoteTitle(note.question, note.answer)}`}
                    style={{
                      width: "100%",
                      padding: 0,
                      border: "none",
                      background: "transparent",
                      color: "inherit",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 700,
                        lineHeight: 1.35,
                        marginBottom: "5px",
                      }}
                    >
                      {buildSavedNoteTitle(note.question, note.answer)}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: darkMode ? "#A1A1AA" : "#666",
                        lineHeight: 1.45,
                      }}
                    >
                      {isAvailable ? buildSavedNotePreview(note.answer) : "Message unavailable"}
                    </div>
                  </button>

                  <div
                    className="d-flex align-items-center justify-content-between mt-2"
                    style={{ gap: "8px" }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        color: darkMode ? "#71717A" : "#9CA3AF",
                      }}
                    >
                      {formatSavedAt(note.createdAt)}
                    </span>
                    <Button
                      variant={darkMode ? "outline-light" : "outline-secondary"}
                      size="sm"
                      onClick={() => onRemoveNote(note.messageId)}
                      aria-label={`Remove saved note: ${buildSavedNoteTitle(note.question, note.answer)}`}
                      title="Remove saved note"
                      style={{
                        minWidth: "34px",
                        width: "34px",
                        height: "30px",
                        padding: 0,
                        borderRadius: "10px",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <DeleteOutlineIcon sx={{ fontSize: 17 }} />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

export default SavedNotes;
