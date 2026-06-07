import React, { useState, useEffect, useCallback } from "react";
import { generateFlashcardsApi, updateFlashcardProgressApi } from "../../services/api";
import toast from "react-hot-toast";
import "./StudyHub.css";

export default function StudyHub({
  darkMode,
  selectedPdf,
  currentPdfSessionId,
  currentPdfSessionSecret,
  currentPdfName,
  pdfs,
  setPdfs,
}) {
  const [activeTab, setActiveTab] = useState("flashcards");
  const [loading, setLoading] = useState(false);
  const [flashcards, setFlashcards] = useState([]);
  const [currentCardIdx, setCurrentCardIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const [quizActive, setQuizActive] = useState(false);
  const [currentQuizIdx, setCurrentQuizIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [quizScore, setQuizScore] = useState(0);
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [isQuizComplete, setIsQuizComplete] = useState(false);

  useEffect(() => {
    if (!selectedPdf) return;
    const current = pdfs.find((p) => p.id === selectedPdf);
    if (current && Array.isArray(current.flashcards)) {
      setFlashcards(current.flashcards);
      setCurrentCardIdx(0);
      setIsFlipped(false);
      setQuizActive(false);
      setIsQuizComplete(false);
    } else {
      setFlashcards([]);
    }
  }, [selectedPdf, pdfs]);

  const handleGenerateCards = async () => {
    if (!currentPdfSessionId || !currentPdfSessionSecret) {
      toast.error("Please select or upload a PDF first.");
      return;
    }

    setLoading(true);
    const progressToast = toast.loading("AI is scanning your document & extracting key concepts...");
    try {
      const data = await generateFlashcardsApi(currentPdfSessionId, currentPdfSessionSecret);
      const cards = data.flashcards || [];

      if (cards.length === 0) {
        toast.error("No readable text found to extract study cards.", { id: progressToast });
      } else {
        setFlashcards(cards);
        setPdfs((prev) =>
          prev.map((p) => (p.id === selectedPdf ? { ...p, flashcards: cards } : p))
        );
        toast.success(`Successfully generated ${cards.length} interactive study cards!`, {
          id: progressToast,
        });
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate study materials. Using smart heuristic extraction...", {
        id: progressToast,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRateCard = async (rating) => {
    if (!currentPdfSessionId || !currentPdfSessionSecret || !flashcards[currentCardIdx]) return;
    const targetCard = flashcards[currentCardIdx];

    try {
      const data = await updateFlashcardProgressApi(
        currentPdfSessionId,
        currentPdfSessionSecret,
        targetCard.id,
        rating
      );

      const updatedCards = data.flashcards || [];
      setFlashcards(updatedCards);
      setPdfs((prev) =>
        prev.map((p) => (p.id === selectedPdf ? { ...p, flashcards: updatedCards } : p))
      );

      setIsFlipped(false);
      setTimeout(() => {
        if (currentCardIdx < flashcards.length - 1) {
          setCurrentCardIdx((prev) => prev + 1);
        } else {
          setCurrentCardIdx(0);
          toast.success("Deck cycle complete! Keep reviewing to master these concepts.");
        }
      }, 200);
    } catch (e) {
      console.error(e);
      toast.error("Failed to save progress.");
    }
  };

  const handleStartQuiz = useCallback(() => {
    if (flashcards.length < 4) {
      toast.error("Need at least 4 study cards in the deck to generate a quiz.");
      return;
    }

    const questions = flashcards.map((card) => {
      const otherAnswers = flashcards
        .filter((c) => c.id !== card.id)
        .map((c) => c.answer);

      const distractors = otherAnswers.sort(() => 0.5 - Math.random()).slice(0, 3);
      const options = [card.answer, ...distractors].sort(() => 0.5 - Math.random());
      const correctIdx = options.indexOf(card.answer);

      return {
        question: card.question,
        correctAnswer: card.answer,
        options,
        correctIdx,
        source_page: card.source_page,
      };
    });

    setQuizQuestions(questions.sort(() => 0.5 - Math.random()));
    setQuizActive(true);
    setCurrentQuizIdx(0);
    setSelectedOption(null);
    setIsAnswered(false);
    setQuizScore(0);
    setIsQuizComplete(false);
  }, [flashcards]);

  const handleOptionClick = (optionIdx) => {
    if (isAnswered) return;
    setSelectedOption(optionIdx);
    setIsAnswered(true);

    const isCorrect = optionIdx === quizQuestions[currentQuizIdx].correctIdx;
    if (isCorrect) {
      setQuizScore((prev) => prev + 1);
      toast.success("Correct! Excellent recall.", { duration: 1000 });
    } else {
      toast.error("Not quite! Study the card for review.", { duration: 1500 });
    }

    setTimeout(() => {
      if (currentQuizIdx < quizQuestions.length - 1) {
        setCurrentQuizIdx((prev) => prev + 1);
        setSelectedOption(null);
        setIsAnswered(false);
      } else {
        setIsQuizComplete(true);
        if (quizScore + (isCorrect ? 1 : 0) === quizQuestions.length) {
          toast.success("🏆 Perfect Score! You have fully mastered this document!", {
            duration: 5000,
          });
        }
      }
    }, 1500);
  };
  const masteredCardsCount = flashcards.filter((c) => c.box >= 5).length;
  const inProgressCardsCount = flashcards.filter((c) => c.box > 1 && c.box < 5).length;

  return (
    <div className={`study-hub-container ${darkMode ? "text-light" : "text-dark"}`}>
      <div className="study-hub-header">
        <h2 className="study-hub-title">
          <span>🧠</span> AI Study Companion
        </h2>
        {flashcards.length > 0 && (
          <div className="study-tab-buttons">
            <button
              className={`study-tab-btn ${activeTab === "flashcards" ? "active" : ""}`}
              onClick={() => {
                setActiveTab("flashcards");
                setQuizActive(false);
              }}
            >
              Study Deck
            </button>
            <button
              className={`study-tab-btn ${activeTab === "quiz" ? "active" : ""}`}
              onClick={() => {
                setActiveTab("quiz");
                handleStartQuiz();
              }}
            >
              Recall Quiz
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="study-loading-skeleton">
          <div className="study-loading-spinner"></div>
          <p style={{ fontWeight: 600, color: "#8b5cf6" }}>
            Extracting core definitions and formulating learning decks...
          </p>
        </div>
      )}

      {!loading && flashcards.length === 0 && (
        <div className="study-empty-state">
          <div className="study-empty-icon">📖</div>
          <h3>AI-Powered Active Recall</h3>
          <p className="text-muted" style={{ fontSize: "0.95rem", marginBottom: "20px" }}>
            Transform this PDF into an interactive learning hub containing double-sided smart
            flashcards and quizzes.
          </p>
          <button className="study-action-btn" onClick={handleGenerateCards}>
            Generate Study Cards
          </button>
        </div>
      )}

      {!loading && flashcards.length > 0 && activeTab === "flashcards" && (
        <div className="flashcard-deck-layout">
          {/* Spaced Repetition Mastery Cards */}
          <div className="mastery-stats-grid">
            <div className="mastery-card" style={{ borderLeft: "4px solid #ef4444" }}>
              <div className="mastery-count" style={{ color: "#ef4444" }}>
                {flashcards.filter((c) => c.box === 1).length}
              </div>
              <div className="mastery-name">New/Unseen</div>
            </div>
            <div className="mastery-card" style={{ borderLeft: "4px solid #f59e0b" }}>
              <div className="mastery-count" style={{ color: "#f59e0b" }}>
                {inProgressCardsCount}
              </div>
              <div className="mastery-name">In Progress</div>
            </div>
            <div className="mastery-card" style={{ borderLeft: "4px solid #10b981" }}>
              <div className="mastery-count" style={{ color: "#10b981" }}>
                {masteredCardsCount}
              </div>
              <div className="mastery-name">Mastered</div>
            </div>
          </div>

          <button
            type="button"
            className={`flashcard-card-perspective`}
            style={{ background: 'transparent', border: 'none', padding: 0, display: 'block', width: '100%', textAlign: 'left' }}
            onClick={() => setIsFlipped(!isFlipped)}
          >
            <div className={`flashcard-card ${isFlipped ? "flipped" : ""}`}>
              {/* Front side */}
              <div className="flashcard-side flashcard-front">
                <div className="flashcard-card-label">
                  <span>Question</span>
                  <span>Box {flashcards[currentCardIdx]?.box || 1}</span>
                </div>
                <div className="flashcard-card-content">
                  {flashcards[currentCardIdx]?.question}
                </div>
                <div className="flashcard-card-hint">Click card to reveal answer</div>
              </div>

              {/* Back side */}
              <div className="flashcard-side flashcard-back">
                <div className="flashcard-card-label">
                  <span>Definition / Answer</span>
                  <span style={{ color: "#10b981" }}>
                    {flashcards[currentCardIdx]?.box >= 5 ? "✨ Mastered" : "Learning"}
                  </span>
                </div>
                <div className="flashcard-card-content" style={{ fontSize: "1.1rem" }}>
                  {flashcards[currentCardIdx]?.answer}
                </div>
                <div className="flashcard-card-hint">Click card to see question</div>
              </div>
            </div>
          </button>

          {/* Rating controls when flipped */}
          <div
            className="leitner-box-ratings"
            style={{
              opacity: isFlipped ? 1 : 0.3,
              pointerEvents: isFlipped ? "all" : "none",
              transition: "opacity 0.3s",
            }}
          >
            <button className="rating-btn again" onClick={() => handleRateCard("again")}>
              Again <span className="rating-subtext">Reset Box</span>
            </button>
            <button className="rating-btn good" onClick={() => handleRateCard("good")}>
              Good <span className="rating-subtext">Keep Box</span>
            </button>
            <button className="rating-btn easy" onClick={() => handleRateCard("easy")}>
              Easy <span className="rating-subtext">Box Up</span>
            </button>
          </div>

          <div className="deck-navigation">
            <button
              className="nav-circle-btn"
              aria-label="Previous card"
              disabled={currentCardIdx === 0}
              onClick={() => {
                setIsFlipped(false);
                setCurrentCardIdx((prev) => prev - 1);
              }}
            >
              ←
            </button>
            <span className="deck-counter-badge">
              {currentCardIdx + 1} of {flashcards.length}
            </span>
            <button
              className="nav-circle-btn"
              aria-label="Next card"
              disabled={currentCardIdx === flashcards.length - 1}
              onClick={() => {
                setIsFlipped(false);
                setCurrentCardIdx((prev) => prev + 1);
              }}
            >
              →
            </button>
          </div>
        </div>
      )}

      {!loading && activeTab === "quiz" && quizActive && (
        <div className="quiz-layout">
          {!isQuizComplete ? (
            <>
              <div className="quiz-progress-section">
                <span>
                  Question {currentQuizIdx + 1} of {quizQuestions.length}
                </span>
                <span style={{ color: "#10b981" }}>Score: {quizScore}</span>
              </div>
              <div className="quiz-progress-bar-container">
                <div
                  className="quiz-progress-bar-fill"
                  style={{
                    width: `${((currentQuizIdx + 1) / quizQuestions.length) * 100}%`,
                  }}
                ></div>
              </div>

              <div className="quiz-question-card">
                {quizQuestions[currentQuizIdx]?.question}
              </div>

              <div className="quiz-options-list">
                {quizQuestions[currentQuizIdx]?.options.map((option, idx) => {
                  let btnClass = "";
                  if (isAnswered) {
                    if (idx === quizQuestions[currentQuizIdx].correctIdx) {
                      btnClass = "correct";
                    } else if (idx === selectedOption) {
                      btnClass = "incorrect";
                    }
                  }

                  return (
                    <button
                      key={idx}
                      className={`quiz-option-btn ${btnClass}`}
                      disabled={isAnswered}
                      onClick={() => handleOptionClick(idx)}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="quiz-results-screen">
              <div style={{ fontSize: "4rem" }}>🎉</div>
              <h2>Quiz Completed!</h2>
              <div className="quiz-score-badge">
                {quizScore} / {quizQuestions.length}
              </div>
              <p className="text-muted">
                {quizScore === quizQuestions.length
                  ? "Perfect! You have unlocked absolute mastery of this document."
                  : "Great effort! Review the cards in the deck to improve your score."}
              </p>
              <div className="quiz-summary-stats">
                <div className="stat-box">
                  <span className="stat-box-val" style={{ color: "#10b981" }}>
                    {Math.round((quizScore / quizQuestions.length) * 100)}%
                  </span>
                  <span className="stat-box-label">Accuracy</span>
                </div>
                <div className="stat-box">
                  <span className="stat-box-val">{quizScore}</span>
                  <span className="stat-box-label">Correct</span>
                </div>
              </div>
              <button className="study-action-btn" onClick={handleStartQuiz}>
                Retake Quiz
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
