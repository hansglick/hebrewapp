import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getRandomVerbe } from "../api/content";
import { getNiveau, createEvaluation } from "../api/user";
import { useSwipe } from "../hooks/useSwipe";
import { useRandomBrowser } from "../hooks/useRandomBrowser";
import { speak } from "../utils/speech";
import "./screens.css";

const TEMPS_LABELS = [
  { key: "past", label: "passé" },
  { key: "present", label: "présent" },
  { key: "futur", label: "futur" },
];

export default function VerbeScreen({ defaultMode = "exploration" }) {
  const { code } = useParams(); // présent seulement si venu par une leçon précise
  const navigate = useNavigate();
  const [niveau, setNiveau] = useState(null);
  const [mode, setMode] = useState(defaultMode);
  const [view, setView] = useState("main"); // main | temps
  const [temps, setTemps] = useState(null);
  const [personneKey, setPersonneKey] = useState(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    getNiveau().then(setNiveau);
  }, []);

  const lessonCode = mode === "exploration" ? code ?? niveau?.level : niveau?.level;

  const { current: verbe, next, back } = useRandomBrowser(
    () => (lessonCode ? getRandomVerbe(lessonCode, mode) : Promise.resolve(null)),
    [lessonCode, mode]
  );

  useEffect(() => {
    setView("main");
    setRevealed(false);
  }, [verbe]);

  function pickRandomPersonne(t) {
    const keys = Object.keys(verbe.conjugaisons[t]);
    return keys[Math.floor(Math.random() * keys.length)];
  }

  function openTemps(t) {
    setTemps(t);
    setView("temps");
    setRevealed(false);
    if (mode === "revision") setPersonneKey(pickRandomPersonne(t));
  }

  function nextPersonne() {
    setPersonneKey(pickRandomPersonne(temps));
    setRevealed(false);
  }

  function handleEvaluate(success) {
    createEvaluation({
      objectType: "verbe",
      objectKey: `${verbe.key}|${temps}|${personneKey}`,
      success,
    }).then(nextPersonne);
  }

  // Un seul useSwipe pour tout l'écran : deux instances actives simultanément
  // attacheraient deux écouteurs clavier en parallèle sur window, chacun
  // réagissant à la même touche indépendamment de la vue affichée.
  const swipeHandlers = useSwipe({
    onSwipeLeft: () => {
      if (view === "temps") setView("main");
      else if (!back()) navigate(-1);
    },
    onSwipeRight: () => {
      if (view === "temps") {
        if (mode === "revision") nextPersonne();
      } else {
        next();
      }
    },
  });

  if (!verbe) return null;

  if (view === "temps") {
    const conjugaisonsTemps = verbe.conjugaisons[temps];
    return (
      <section className="screen" {...swipeHandlers}>
        <h1 className="hebrew">{verbe.pure}</h1>
        <p className="muted">{TEMPS_LABELS.find((t) => t.key === temps)?.label}</p>

        {mode === "exploration" &&
          Object.values(conjugaisonsTemps).map((c) => (
            <p key={c.personne}>
              <span className="hebrew">{c.conjugaison}</span> — {c.personne}
            </p>
          ))}

        {mode === "revision" && (
          <>
            <p>{conjugaisonsTemps[personneKey]?.personne}</p>
            {!revealed && (
              <button type="button" className="link-btn" onClick={() => setRevealed(true)}>
                ?
              </button>
            )}
            {revealed && (
              <>
                <p className="hebrew-large">{conjugaisonsTemps[personneKey]?.conjugaison}</p>
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
      </section>
    );
  }

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

      <h1 className="hebrew-large">
        {verbe.pure}
        <span
          className="binyan-pill"
          style={{ backgroundColor: verbe.binyan_color, cursor: "pointer" }}
          onClick={() => navigate(`/binyans/${encodeURIComponent(verbe.binyan)}`)}
        />
      </h1>
      <button type="button" className="link-btn" onClick={() => speak(verbe.pure)}>
        🔊
      </button>
      <p>{verbe.traduction}</p>

      <p className="muted">conjugaison</p>
      <div className="toggle-group">
        {TEMPS_LABELS.map((t) => (
          <button key={t.key} type="button" onClick={() => openTemps(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
    </section>
  );
}
