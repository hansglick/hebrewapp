import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { getRandomMot, getRacine } from "../api/content";
import { getNiveau, createEvaluation, markObjectSeen } from "../api/user";
import { useSwipe } from "../hooks/useSwipe";
import { useRandomBrowser } from "../hooks/useRandomBrowser";
import { speak } from "../utils/speech";
import { ActionHints } from "../components/ActionHints";
import { SpeakerIcon } from "../components/SpeakerIcon";
import { RacineCard } from "../components/RacineCard";
import { PoolBadge } from "../components/PoolBadge";
import "./screens.css";

export default function MotScreen() {
  const { code } = useParams(); // présent seulement si venu par une leçon précise
  const navigate = useNavigate();
  const location = useLocation();
  const [niveau, setNiveau] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [racineDetails, setRacineDetails] = useState(null);
  const [pulse, setPulse] = useState(null); // "success" | "danger" | null

  // Le mode découle du chemin d'accès : apprentissage (code présent) parcourt
  // simplement la liste ordonnée de la leçon ; révisions (code absent) tire
  // selon la difficulté/récence. Ce n'est plus un choix utilisateur — le
  // raccourci "révisions" existe justement pour réviser sans dépendre d'une
  // leçon précise.
  const mode = code ? "exploration" : "revision";

  useEffect(() => {
    getNiveau().then(setNiveau);
  }, []);

  const lessonCode = code ?? niveau?.reference_lesson;

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
    (prevMot) => (lessonCode ? getRandomMot(lessonCode, mode, prevMot?.key) : Promise.resolve(null)),
    browserDeps,
    restoreMot
  );

  // La fiche racine s'affiche directement sous la paire de mots (exploration
  // et révision) plutôt que de naviguer vers un écran séparé.
  function toggleRacineInline() {
    if (racineDetails) {
      setRacineDetails(null);
      return;
    }
    if (mot.racine) getRacine(mot.racine).then(setRacineDetails);
  }

  useEffect(() => {
    setRevealed(false);
    setRacineDetails(null);
    setPulse(null);
  }, [mot]);

  // Progression d'exploration de la leçon (cf. GET /api/lecons/{code}/
  // exploration) : "vu" quel que soit le mode, indépendant du useEffect
  // ci-dessus.
  useEffect(() => {
    if (mot) markObjectSeen({ objectType: "mot", objectKey: mot.key });
  }, [mot]);

  // Anime brièvement le bouton choisi avant de passer au mot suivant, pour
  // que le user perçoive bien son choix (surtout via les raccourcis clavier
  // 1/0 qui n'ont pas de retour visuel de "clic").
  function handleEvaluate(success) {
    setPulse(success ? "success" : "danger");
    createEvaluation({ objectType: "mot", objectKey: `${mot.key}|${mot.langue}`, success }).then(() => {
      setTimeout(() => {
        setPulse(null);
        next();
      }, 350);
    });
  }

  useEffect(() => {
    if (mode !== "revision" || !revealed) return;
    function handleKeyDown(e) {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "1") handleEvaluate(true);
      else if (e.key === "0") handleEvaluate(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, revealed, mot]);

  const swipeHandlers = useSwipe({
    onSwipeLeft: () => {
      if (!back()) navigate(-1);
    },
    onSwipeRight: () => next(),
    onSpace:
      mode === "exploration"
        ? toggleRacineInline
        : !revealed
        ? () => setRevealed(true)
        : undefined,
  });

  if (!mot) return null;

  const isTopHebrew = mot.langue === "hebreu";
  const topText = isTopHebrew ? mot.original : mot.french;
  const bottomText = isTopHebrew ? mot.french : mot.original;

  return (
    <section className="screen" onPointerDown={swipeHandlers.onPointerDown}>
      <ActionHints {...swipeHandlers.hints} digits={mode === "revision" && revealed} />

      {mode === "revision" && <PoolBadge pool={mot.pool} chapter={mot.chapter} lesson={mot.lesson} />}

      {mode === "revision" && (
        <hr
          style={{
            width: "100%",
            maxWidth: 320,
            border: "none",
            borderTop: "1px solid var(--border)",
            margin: "1em 0 0",
          }}
        />
      )}

      {mode === "exploration" && (
        <div
          style={{
            minHeight: "60vh",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
          }}
        >
          <span className="hebrew-word-row">
            <button
              type="button"
              className="speak-btn"
              style={{ marginInlineEnd: "0.6em" }}
              onClick={() => speak(mot.original)}
            >
              <SpeakerIcon color="var(--text)" size={27} />
            </button>
            <span className="hebrew" style={{ fontWeight: 700, fontSize: "3.25em" }}>
              {mot.original}
            </span>
            <button
              type="button"
              className="speak-btn"
              style={{ marginInlineStart: "0.6em" }}
              onClick={toggleRacineInline}
            >
              <span className="racine-badge" style={{ background: "#64748b", fontWeight: 700 }}>
                ש
              </span>
            </button>
          </span>

          <hr
            style={{
              width: "70%",
              maxWidth: 400,
              border: "none",
              borderTop: "1px solid var(--border)",
              margin: 0,
            }}
          />

          <span style={{ fontStyle: "italic", fontSize: "3.25em", color: "var(--textMuted)" }}>{mot.french}</span>

          {racineDetails && <RacineCard racine={racineDetails} />}
        </div>
      )}

      {mode === "revision" && (
        <h1 style={{ margin: 0 }}>
          {isTopHebrew ? (
            <HebrewWordRow word={topText} onToggleRacine={toggleRacineInline} onSpeak={() => speak(mot.original)} />
          ) : (
            <span style={{ fontWeight: 400, fontSize: "16px" }}>{topText}</span>
          )}
        </h1>
      )}

      {mode === "revision" && isTopHebrew && racineDetails && <RacineCard racine={racineDetails} />}

      {mode === "revision" && !revealed && (
        <button
          type="button"
          className="speak-btn"
          onClick={() => setRevealed(true)}
          style={{
            fontStyle: "italic",
            fontSize: "0.57em",
            color: "var(--textMuted)",
            marginTop: !isTopHebrew ? "-5.3px" : undefined,
          }}
        >
          Traduis
        </button>
      )}

      {mode === "revision" && revealed && (
        <>
          <div
            style={{
              display: "flex",
              flexDirection: !isTopHebrew ? "column" : "row",
              alignItems: "center",
              justifyContent: "center",
              gap: !isTopHebrew ? "0.9em" : "0.5em",
              marginTop: !isTopHebrew ? "-5.3px" : undefined,
            }}
          >
            <p style={{ margin: 0 }}>
              {!isTopHebrew ? (
                <HebrewWordRow
                  word={bottomText}
                  onToggleRacine={toggleRacineInline}
                  onSpeak={() => speak(mot.original)}
                  speakerSize={21.6}
                />
              ) : (
                <span style={{ fontWeight: 400, fontSize: "16px" }}>{bottomText}</span>
              )}
            </p>
            <div style={{ display: "flex", gap: 0 }}>
              <button
                type="button"
                className={`eval-btn danger${pulse === "danger" ? " pulse" : ""}`}
                style={!isTopHebrew ? { fontSize: "1.284em" } : undefined}
                onClick={() => handleEvaluate(false)}
              >
                ✗
              </button>
              <button
                type="button"
                className={`eval-btn success${pulse === "success" ? " pulse" : ""}`}
                style={!isTopHebrew ? { fontSize: "1.284em" } : undefined}
                onClick={() => handleEvaluate(true)}
              >
                ✓
              </button>
            </div>
          </div>
          {!isTopHebrew && racineDetails && <RacineCard racine={racineDetails} />}
        </>
      )}
    </section>
  );
}

function HebrewWordRow({ word, onToggleRacine, onSpeak, speakerSize = 27 }) {
  return (
    <span className="hebrew-word-row" style={{ fontSize: "var(--font-size-hebrew-large)" }}>
      <button type="button" className="speak-btn" onClick={onToggleRacine}>
        <span className="racine-badge" style={{ background: "#64748b", fontWeight: 700, fontSize: "0.506em" }}>
          ש
        </span>
      </button>
      <span style={{ color: "var(--textMuted)", fontWeight: 300, fontSize: "0.75em" }}>|</span>
      <span className="hebrew" style={{ fontWeight: 400 }}>{word}</span>
      <span style={{ color: "var(--textMuted)", fontWeight: 300, fontSize: "0.75em" }}>|</span>
      <button type="button" className="speak-btn" onClick={onSpeak}>
        <SpeakerIcon color="#64748b" size={speakerSize} />
      </button>
    </span>
  );
}
