import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getRandomPhrase } from "../api/content";
import { getNiveau, createEvaluation } from "../api/user";
import { evaluateTranslation } from "../api/gemini";
import { useSwipe } from "../hooks/useSwipe";
import { useRandomBrowser } from "../hooks/useRandomBrowser";
import { speak } from "../utils/speech";
import HebrewInput from "../components/HebrewInput";
import "./screens.css";

export default function QuestionEcriteScreen({ defaultMode = "exploration" }) {
  const { code } = useParams(); // présent seulement si venu par une leçon précise
  const navigate = useNavigate();
  const [niveau, setNiveau] = useState(null);
  const [mode, setMode] = useState(defaultMode);
  const [evalMode, setEvalMode] = useState("auto"); // auto | prof
  const [direction, setDirection] = useState("hebreu"); // hebreu = ->Hébreu (source français), francais = ->Français (source hébreu)
  const [revealed, setRevealed] = useState(false);
  const [studentSolution, setStudentSolution] = useState("");
  const [geminiResult, setGeminiResult] = useState(null);
  const [geminiError, setGeminiError] = useState(null);
  const [loadingGemini, setLoadingGemini] = useState(false);

  useEffect(() => {
    getNiveau().then(setNiveau);
  }, []);

  const lessonCode = mode === "exploration" ? code ?? niveau?.level : niveau?.level;

  const { current: phrase, next, back } = useRandomBrowser(
    () => (lessonCode ? getRandomPhrase(lessonCode, mode) : Promise.resolve(null)),
    [lessonCode, mode]
  );

  useEffect(() => {
    setRevealed(false);
    setStudentSolution("");
    setGeminiResult(null);
    setGeminiError(null);
  }, [phrase, evalMode]);

  function handleEvaluate(success) {
    createEvaluation({
      objectType: "phrase_auto",
      objectKey: `${phrase.lesson_code}|${phrase.position}|${direction}`,
      success,
    }).then(next);
  }

  async function handleSubmitProf() {
    setLoadingGemini(true);
    setGeminiError(null);
    try {
      const result = await evaluateTranslation({
        lessonCode: phrase.lesson_code,
        position: phrase.position,
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

  const swipeHandlers = useSwipe({
    onSwipeLeft: () => {
      if (!back()) navigate(-1);
    },
    onSwipeRight: () => next(),
  });

  if (!phrase) return null;

  const isSourceHebrew = direction === "francais";
  const sourceText = isSourceHebrew ? phrase.hebrew : phrase.french;
  const targetText = isSourceHebrew ? phrase.french : phrase.hebrew;
  const targetIsHebrew = !isSourceHebrew;

  return (
    <section className="screen" {...swipeHandlers}>
      <div className="toggle-group">
        <button
          type="button"
          className={mode === "exploration" ? "active" : ""}
          onClick={() => setMode("exploration")}
        >
          Exploration
        </button>
        <button
          type="button"
          className={mode === "revision" ? "active" : ""}
          onClick={() => setMode("revision")}
        >
          Révision
        </button>
      </div>
      <div className="toggle-group">
        <button
          type="button"
          className={evalMode === "auto" ? "active" : ""}
          onClick={() => setEvalMode("auto")}
        >
          Auto-éval
        </button>
        <button
          type="button"
          className={evalMode === "prof" ? "active" : ""}
          onClick={() => setEvalMode("prof")}
        >
          Prof éval
        </button>
      </div>
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

      {evalMode === "auto" && (
        <>
          {!revealed && (
            <button type="button" className="link-btn" onClick={() => setRevealed(true)}>
              ?
            </button>
          )}

          {revealed && (
            <>
              <p className={!isSourceHebrew ? "hebrew-large" : ""}>{targetText}</p>
              <button type="button" className="link-btn" onClick={() => speak(phrase.hebrew)}>
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

      {evalMode === "prof" && (
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
                onClick={handleSubmitProf}
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
              <button type="button" className="link-btn" onClick={next}>
                Question suivante
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
