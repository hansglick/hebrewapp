import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getExamen } from "../../api/content";
import { createEvaluation, updateNiveau } from "../../api/user";
import { speak } from "../../utils/speech";
import "../screens.css";

export default function ExamenEcritScreen() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState(null);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState([]);
  const [direction, setDirection] = useState("hebreu");
  const [revealed, setRevealed] = useState(false);
  const [finalResult, setFinalResult] = useState(null);

  useEffect(() => {
    getExamen(code).then(setExam);
  }, [code]);

  function handleEvaluate(success) {
    const q = exam.questions[index];
    createEvaluation({
      objectType: "phrase_auto",
      objectKey: `${q.lesson_code}|${q.position}|${direction}`,
      success,
    });

    const newResults = [...results, success];
    setRevealed(false);

    if (index + 1 < exam.questions.length) {
      setResults(newResults);
      setIndex(index + 1);
      return;
    }

    const scoreCount = newResults.filter(Boolean).length;
    const ratio = scoreCount / exam.total_questions;
    const passed = ratio >= exam.pass_threshold;
    if (passed) {
      updateNiveau(code);
    }
    setFinalResult({ passed, scoreCount, total: exam.total_questions, ratio });
  }

  if (!exam) return null;

  if (finalResult) {
    return (
      <section className="screen">
        <h1>{finalResult.passed ? "Examen réussi !" : "Examen non validé"}</h1>
        <p>
          Score : {finalResult.scoreCount} / {finalResult.total} (
          {Math.round(finalResult.ratio * 100)}%)
        </p>
        {finalResult.passed ? (
          <p>Niveau {code} atteint.</p>
        ) : (
          <p>Seuil requis : {Math.round(exam.pass_threshold * 100)}%. Retente quand tu veux.</p>
        )}
        <button type="button" className="link-btn" onClick={() => navigate("/examen/ecrite")}>
          Retour aux examens
        </button>
      </section>
    );
  }

  const q = exam.questions[index];
  const isSourceHebrew = direction === "francais";
  const sourceText = isSourceHebrew ? q.hebrew : q.french;
  const targetText = isSourceHebrew ? q.french : q.hebrew;

  return (
    <section className="screen">
      <p className="muted">
        Examen {code} — Question {index + 1} / {exam.questions.length}
        {exam.is_special ? " (examen spécial)" : ""}
      </p>
      <div className="toggle-group">
        <button
          type="button"
          className={direction === "hebreu" ? "active" : ""}
          onClick={() => setDirection("hebreu")}
        >
          -&gt; Hébreu
        </button>
        <button
          type="button"
          className={direction === "francais" ? "active" : ""}
          onClick={() => setDirection("francais")}
        >
          -&gt; Français
        </button>
      </div>

      <p className={isSourceHebrew ? "hebrew-large" : ""}>{sourceText}</p>

      {!revealed && (
        <button type="button" className="link-btn" onClick={() => setRevealed(true)}>
          ?
        </button>
      )}

      {revealed && (
        <>
          <p className={!isSourceHebrew ? "hebrew-large" : ""}>{targetText}</p>
          <button type="button" className="link-btn" onClick={() => speak(q.hebrew)}>
            🔊
          </button>
          <div className="eval-actions">
            <button
              type="button"
              className="eval-btn danger"
              onClick={() => handleEvaluate(false)}
            >
              ✗
            </button>
            <button
              type="button"
              className="eval-btn success"
              onClick={() => handleEvaluate(true)}
            >
              ✓
            </button>
          </div>
        </>
      )}
    </section>
  );
}
