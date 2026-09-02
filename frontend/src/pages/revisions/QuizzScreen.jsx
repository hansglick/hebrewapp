import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getRandomQuizz } from "../../api/content";
import { getNiveau, createEvaluation } from "../../api/user";
import { useSwipe } from "../../hooks/useSwipe";
import { useRandomBrowser } from "../../hooks/useRandomBrowser";
import { ActionHints } from "../../components/ActionHints";
import { NextPrevButtons } from "../../components/NextPrevButtons";
import { PoolBadge } from "../../components/PoolBadge";
import { QuizzBubbles } from "../../components/QuizzBubbles";
import "../screens.css";

export default function QuizzScreen() {
  const navigate = useNavigate();
  const [niveau, setNiveau] = useState(null);
  const [selected, setSelected] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    getNiveau().then(setNiveau);
  }, []);

  const lessonCode = niveau?.reference_lesson;

  const { current: quizz, next, back } = useRandomBrowser(
    () => (lessonCode ? getRandomQuizz(lessonCode) : Promise.resolve(null)),
    [lessonCode]
  );

  useEffect(() => {
    setSelected(null);
    setSubmitted(false);
  }, [quizz]);

  function handleSubmit() {
    if (!selected || submitted) return;
    setSubmitted(true);
    createEvaluation({
      objectType: "quizz",
      objectKey: quizz.key,
      success: selected === quizz.key,
    });
  }

  useEffect(() => {
    if (!submitted) return undefined;
    const id = setTimeout(() => next(), 2000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted]);

  useEffect(() => {
    if (!quizz || submitted) return;
    function handleKeyDown(e) {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Enter") handleSubmit();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizz, selected, submitted]);

  function goPrevious() {
    if (!back()) navigate(-1);
  }
  function goNext() {
    next();
  }

  const swipeHandlers = useSwipe({
    onSwipeLeft: goPrevious,
    onSwipeRight: goNext,
  });

  if (!quizz) return null;

  return (
    <section className="screen" style={{ paddingBottom: 80 }} onPointerDown={swipeHandlers.onPointerDown}>
      <ActionHints {...swipeHandlers.hints} />
      <NextPrevButtons onPrevious={goPrevious} onNext={goNext} />
      <PoolBadge pool={quizz.pool} chapter={quizz.chapter} lesson={quizz.lesson} />
      <hr
        style={{
          width: 200,
          border: "none",
          borderTop: "1px solid var(--border)",
          margin: 0,
        }}
      />

      <p style={{ color: "var(--text)", margin: 0, fontSize: "0.96em" }}>{quizz.french}</p>

      <QuizzBubbles
        options={quizz.options}
        correctKey={quizz.key}
        selectedKey={selected}
        onSelect={submitted ? undefined : setSelected}
        disabled={submitted}
      />

      {selected && !submitted && (
        <button
          type="button"
          className="link-btn"
          style={{
            marginTop: 0,
            fontStyle: "italic",
            color: "var(--textMuted)",
            fontSize: "0.75em",
            textDecoration: "none",
          }}
          onClick={handleSubmit}
        >
          Valider ma réponse
        </button>
      )}

      {submitted && (
        <p style={{ fontWeight: 600, color: selected === quizz.key ? "var(--success)" : "var(--danger)" }}>
          {selected === quizz.key ? "Correct" : "Incorrect"}
        </p>
      )}
    </section>
  );
}
