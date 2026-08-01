import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getRandomMot } from "../api/content";
import { getNiveau, createEvaluation } from "../api/user";
import { useSwipe } from "../hooks/useSwipe";
import { speak } from "../utils/speech";
import "./screens.css";

export default function MotScreen({ defaultMode = "exploration" }) {
  const { code } = useParams(); // présent seulement si venu par une leçon précise
  const navigate = useNavigate();
  const [niveau, setNiveau] = useState(null);
  const [langue, setLangue] = useState("hebreu");
  const [mode, setMode] = useState(defaultMode);
  const [mot, setMot] = useState(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    getNiveau().then(setNiveau);
  }, []);

  function loadRandom(nextMode = mode) {
    const lessonCode = nextMode === "exploration" ? code ?? niveau?.level : niveau?.level;
    if (!lessonCode) return;
    getRandomMot(lessonCode, nextMode).then(setMot);
    setRevealed(false);
  }

  useEffect(() => {
    if (niveau) loadRandom(mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [niveau]);

  function handleModeChange(nextMode) {
    setMode(nextMode);
    loadRandom(nextMode);
  }

  function handleEvaluate(success) {
    createEvaluation({ objectType: "mot", objectKey: `${mot.key}|${langue}`, success }).then(
      () => loadRandom()
    );
  }

  const swipeHandlers = useSwipe({
    onSwipeLeft: () => loadRandom(),
    onSwipeRight: () => navigate(-1),
  });

  if (!mot) return null;

  const isTopHebrew = langue === "hebreu";
  const topText = isTopHebrew ? mot.original : mot.french;
  const bottomText = isTopHebrew ? mot.french : mot.original;

  return (
    <section className="screen" {...swipeHandlers}>
      <div className="toggle-group">
        <button
          type="button"
          className={langue === "hebreu" ? "active" : ""}
          onClick={() => setLangue("hebreu")}
        >
          Hébreu
        </button>
        <button
          type="button"
          className={langue === "francais" ? "active" : ""}
          onClick={() => setLangue("francais")}
        >
          Français
        </button>
      </div>
      <div className="toggle-group">
        <button
          type="button"
          className={mode === "exploration" ? "active" : ""}
          onClick={() => handleModeChange("exploration")}
        >
          Exploration
        </button>
        <button
          type="button"
          className={mode === "revision" ? "active" : ""}
          onClick={() => handleModeChange("revision")}
        >
          Révision
        </button>
      </div>

      <h1 className={isTopHebrew ? "hebrew-large" : ""}>{topText}</h1>

      {mode === "exploration" && (
        <>
          <p className={!isTopHebrew ? "hebrew" : ""}>{bottomText}</p>
          <HebrewAids racine={mot.racine} onSpeak={() => speak(mot.original)} />
        </>
      )}

      {mode === "revision" && !revealed && (
        <button type="button" className="link-btn" onClick={() => setRevealed(true)}>
          ?
        </button>
      )}

      {mode === "revision" && revealed && (
        <>
          <p className={!isTopHebrew ? "hebrew" : ""}>{bottomText}</p>
          <HebrewAids racine={mot.racine} onSpeak={() => speak(mot.original)} />
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

function HebrewAids({ racine, onSpeak }) {
  const navigate = useNavigate();
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <button
        type="button"
        className="link-btn"
        onClick={() => navigate(`/racine/${encodeURIComponent(racine)}`)}
      >
        {racine} — en savoir plus
      </button>
      <button type="button" className="link-btn" onClick={onSpeak}>
        🔊
      </button>
    </div>
  );
}
