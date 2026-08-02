import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getExamen } from "../../api/content";
import { createEvaluation, passExamen } from "../../api/user";
import { evaluateTranslation } from "../../api/gemini";
import { speak } from "../../utils/speech";
import HebrewInput from "../../components/HebrewInput";
import "../screens.css";

const GEMINI_SUCCESS_THRESHOLD = 4;

export default function ExamenEcritScreen() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState(null);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState([]);
  const [direction, setDirection] = useState("hebreu");
  const [revealed, setRevealed] = useState(false);
  const [offline, setOffline] = useState(false);
  const [studentSolution, setStudentSolution] = useState("");
  const [geminiResult, setGeminiResult] = useState(null);
  const [geminiError, setGeminiError] = useState(null);
  const [loadingGemini, setLoadingGemini] = useState(false);
  const [finalResult, setFinalResult] = useState(null);

  useEffect(() => {
    getExamen(code).then(setExam);
  }, [code]);

  useEffect(() => {
    setRevealed(false);
    setStudentSolution("");
    setGeminiResult(null);
    setGeminiError(null);
  }, [index, offline]);

  async function advance(success) {
    const newResults = [...results, success];

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

  function handleEvaluate(success) {
    const q = exam.questions[index];
    createEvaluation({
      objectType: "phrase_auto",
      objectKey: `${q.lesson_code}|${q.position}|${direction}`,
      success,
    });
    advance(success);
  }

  async function handleSubmitOnline() {
    const q = exam.questions[index];
    setLoadingGemini(true);
    setGeminiError(null);
    try {
      const result = await evaluateTranslation({
        lessonCode: q.lesson_code,
        position: q.position,
        direction,
        studentSolution,
      });
      setGeminiResult(result);
    } catch (e) {
      setGeminiError(e.message);
    } finally {
      setLoadingGemini(false);
    }
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
  const targetIsHebrew = !isSourceHebrew;

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

      {offline && (
        <>
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
        </>
      )}

      {!offline && (
        <>
          {!geminiResult && (
            <>
              {targetIsHebrew ? (
                <HebrewInput
                  value={studentSolution}
                  onChange={setStudentSolution}
                  rows={3}
                  placeholder="Ta traduction..."
                />
              ) : (
                <textarea
                  value={studentSolution}
                  onChange={(e) => setStudentSolution(e.target.value)}
                  rows={3}
                  style={{ width: "100%", maxWidth: 320, fontFamily: "inherit" }}
                  placeholder="Ta traduction..."
                />
              )}
              <button
                type="button"
                className="link-btn"
                disabled={loadingGemini || !studentSolution.trim()}
                onClick={handleSubmitOnline}
              >
                {loadingGemini ? "Envoi..." : "Envoyer"}
              </button>
              {geminiError && (
                <p className="muted" style={{ color: "var(--danger)" }}>
                  {geminiError}
                </p>
              )}
            </>
          )}

          {geminiResult && (
            <>
              <p>
                <strong>Note du professeur : {geminiResult.score} / 5</strong>
              </p>
              <p className="muted">Ta traduction : {geminiResult.translation}</p>
              <ul className="words-list">
                {geminiResult.observations.map((obs, i) => (
                  <li key={i}>{obs}</li>
                ))}
              </ul>
              <button
                type="button"
                className="link-btn"
                onClick={() => advance(geminiResult.score >= GEMINI_SUCCESS_THRESHOLD)}
              >
                Question suivante
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
