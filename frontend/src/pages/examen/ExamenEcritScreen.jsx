import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getExamen } from "../../api/content";
import { createEvaluation, passExamen } from "../../api/user";
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
  const [offline, setOffline] = useState(false);
  const [finalResult, setFinalResult] = useState(null);

  useEffect(() => {
    getExamen(code).then(setExam);
  }, [code]);

  async function handleEvaluate(success) {
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

    let passResult = null;
    if (passed) {
      passResult = await passExamen(code, { examType: "ecrit", offline });
    }
    setFinalResult({ passed, scoreCount, total: exam.total_questions, ratio, passResult });
  }

  if (!exam) return null;

  if (finalResult) {
    const { passed, passResult } = finalResult;
    return (
      <section className="screen">
        <h1>
          {passed
            ? passResult?.niveau_updated
              ? "Examen réussi !"
              : "Écrit validé"
            : "Examen non validé"}
        </h1>
        <p>
          Score : {finalResult.scoreCount} / {finalResult.total} (
          {Math.round(finalResult.ratio * 100)}%)
        </p>
        {passed && passResult?.niveau_updated && (
          <p>
            Niveau {code} atteint{offline ? " (mode hors-ligne, examen oral non requis)" : ""}.
          </p>
        )}
        {passed && !passResult?.niveau_updated && (
          <>
            <p>Il reste l'examen oral de cette leçon pour valider le niveau.</p>
            <button
              type="button"
              className="link-btn"
              onClick={() => navigate(`/examen/orale/${code}`)}
            >
              Passer l'oral
            </button>
          </>
        )}
        {!passed && (
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
      <div className="toggle-group">
        <button
          type="button"
          className={!offline ? "active" : ""}
          onClick={() => setOffline(false)}
        >
          En ligne
        </button>
        <button
          type="button"
          className={offline ? "active" : ""}
          onClick={() => setOffline(true)}
        >
          Mode hors-ligne
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
