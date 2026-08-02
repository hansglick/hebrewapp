import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { getRandomMot } from "../api/content";
import { getNiveau, createEvaluation } from "../api/user";
import { useSwipe } from "../hooks/useSwipe";
import { useRandomBrowser } from "../hooks/useRandomBrowser";
import { usePersistedState } from "../hooks/usePersistedState";
import { speak } from "../utils/speech";
import "./screens.css";

export default function MotScreen({ defaultMode = "exploration" }) {
  const { code } = useParams(); // présent seulement si venu par une leçon précise
  const navigate = useNavigate();
  const location = useLocation();
  const [niveau, setNiveau] = useState(null);
  const [langue, setLangue] = useState("hebreu");
  const [mode, setMode] = usePersistedState("mot-screen-mode", defaultMode);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    getNiveau().then(setNiveau);
  }, []);

  const lessonCode = mode === "exploration" ? code ?? niveau?.level : niveau?.level;

  // Si on revient d'un écran racine (flèche gauche), location.state.restoreMot
  // contient le mot exact quitté — évite de retomber sur un tirage aléatoire.
  // Tant qu'on restaure, on fige lessonCode dans les deps : sinon la
  // résolution asynchrone de `niveau` (undefined -> valeur réelle, juste
  // après le montage) déclenche un second effet qui écraserait la
  // restauration par un tirage aléatoire. `mode` reste réactif : un
  // changement manuel de mode doit toujours déclencher un nouveau tirage.
  const restoreMot = location.state?.restoreMot;
  const browserDeps = restoreMot ? ["__restore__", mode] : [lessonCode, mode];

  const { current: mot, next, back } = useRandomBrowser(
    () => (lessonCode ? getRandomMot(lessonCode, mode) : Promise.resolve(null)),
    browserDeps,
    restoreMot
  );

  function viewRacine(racine) {
    navigate(`/racine/${encodeURIComponent(racine)}`, {
      state: { returnPath: location.pathname, mot },
    });
  }

  useEffect(() => {
    setRevealed(false);
  }, [mot]);

  function handleEvaluate(success) {
    createEvaluation({ objectType: "mot", objectKey: `${mot.key}|${langue}`, success }).then(next);
  }

  const swipeHandlers = useSwipe({
    onSwipeLeft: () => {
      if (!back()) navigate(-1);
    },
    onSwipeRight: () => next(),
    onSpace: () => {
      if (mode !== "revision") return;
      if (!revealed) setRevealed(true);
      else if (mot.racine) viewRacine(mot.racine);
    },
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

      <h1 className={isTopHebrew ? "hebrew-large" : ""}>{topText}</h1>

      {mode === "exploration" && (
        <>
          <p className={!isTopHebrew ? "hebrew" : ""}>{bottomText}</p>
          <HebrewAids
            racine={mot.racine}
            onSpeak={() => speak(mot.original)}
            onViewRacine={() => viewRacine(mot.racine)}
          />
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
          <HebrewAids
            racine={mot.racine}
            onSpeak={() => speak(mot.original)}
            onViewRacine={() => viewRacine(mot.racine)}
          />
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

function HebrewAids({ racine, onSpeak, onViewRacine }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <button type="button" className="link-btn" onClick={onViewRacine}>
        {racine} — voir la racine
      </button>
      <button type="button" className="link-btn" onClick={onSpeak}>
        🔊
      </button>
    </div>
  );
}
