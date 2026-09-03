import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getRandomVerbe, getBinyan, getRacine } from "../api/content";
import { getNiveau, createEvaluation, markObjectSeen } from "../api/user";
import { useSwipe } from "../hooks/useSwipe";
import { useRandomBrowser } from "../hooks/useRandomBrowser";
import { speak } from "../utils/speech";
import { ActionHints } from "../components/ActionHints";
import { NextPrevButtons } from "../components/NextPrevButtons";
import { SpeakerIcon } from "../components/SpeakerIcon";
import { RacineCard } from "../components/RacineCard";
import { PoolBadge } from "../components/PoolBadge";
import "./screens.css";

const TEMPS_LABELS = [
  { key: "past", label: "passé" },
  { key: "present", label: "présent" },
  { key: "futur", label: "futur" },
];

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function VerbeScreen() {
  const { code } = useParams(); // présent seulement si venu par une leçon précise
  const navigate = useNavigate();
  const [niveau, setNiveau] = useState(null);
  const [temps, setTemps] = useState("present");
  const [personneKey, setPersonneKey] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [binyanDetails, setBinyanDetails] = useState(null);
  const [racineDetails, setRacineDetails] = useState(null);
  const [pulse, setPulse] = useState(null); // "success" | "danger" | null
  // Mémorise le temps à conserver pour le prochain verbe (question suivante
  // en révision) — un ref car il doit survivre au tirage async du verbe.
  const keepTempsRef = useRef(null);

  // Le mode découle du chemin d'accès, cf. MotScreen.
  const mode = code ? "exploration" : "revision";

  useEffect(() => {
    getNiveau().then(setNiveau);
  }, []);

  const lessonCode = code ?? niveau?.reference_lesson;

  const { current: verbe, next, back } = useRandomBrowser(
    (prevVerbe) => (lessonCode ? getRandomVerbe(lessonCode, mode, prevVerbe?.key) : Promise.resolve(null)),
    [lessonCode, mode]
  );

  useEffect(() => {
    if (!verbe) return;
    const t = keepTempsRef.current ?? "present";
    keepTempsRef.current = null;
    setTemps(t);
    setRevealed(false);
    setBinyanDetails(null);
    setRacineDetails(null);
    setPulse(null);
    if (mode === "revision") setPersonneKey(pickRandomPersonne(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verbe]);

  // Progression d'exploration de la leçon (cf. GET /api/lecons/{code}/
  // exploration) : "vu" quel que soit le mode.
  useEffect(() => {
    if (verbe) markObjectSeen({ objectType: "verbe", objectKey: verbe.key });
  }, [verbe]);

  // La fiche binyan/racine s'affiche directement sous le verbe plutôt que de
  // naviguer vers un écran séparé (cf. toggleRacineInline dans MotScreen,
  // même principe).
  function toggleBinyanInline() {
    if (binyanDetails) {
      setBinyanDetails(null);
      return;
    }
    getBinyan(verbe.binyan).then(setBinyanDetails);
  }

  function toggleRacineInline() {
    if (racineDetails) {
      setRacineDetails(null);
      return;
    }
    if (verbe.racine) getRacine(verbe.racine).then(setRacineDetails);
  }

  function pickRandomPersonne(t) {
    const keys = Object.keys(verbe.conjugaisons?.[t] ?? {});
    return keys.length ? keys[Math.floor(Math.random() * keys.length)] : null;
  }

  function openTemps(t) {
    setTemps(t);
    setRevealed(false);
    setPulse(null);
    if (mode === "revision") setPersonneKey(pickRandomPersonne(t));
  }

  // Question suivante en révision : tire à la fois un nouveau verbe (next())
  // et, via keepTempsRef (lu par l'effet [verbe]), une nouvelle personne du
  // même temps sélectionné — sinon on retombe toujours sur le même verbe,
  // seule la personne change.
  function nextQuestion() {
    keepTempsRef.current = temps;
    setRevealed(false);
    next();
  }

  // Anime brièvement le bouton choisi avant de passer à la question suivante,
  // cf. MotScreen::handleEvaluate (même logique).
  function handleEvaluate(success) {
    setPulse(success ? "success" : "danger");
    createEvaluation({
      objectType: "verbe",
      objectKey: `${verbe.key}|${temps}|${personneKey}`,
      success,
    }).then(() => {
      setTimeout(() => {
        setPulse(null);
        nextQuestion();
      }, 350);
    });
  }

  useEffect(() => {
    if (mode !== "revision" || !temps || !revealed) return;
    function handleKeyDown(e) {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "1") handleEvaluate(true);
      else if (e.key === "0") handleEvaluate(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, temps, revealed, personneKey]);

  function goPrevious() {
    if (temps) setTemps(null);
    else if (!back()) navigate(-1);
  }
  function goNext() {
    if (temps && mode === "revision") nextQuestion();
    else next();
  }

  const swipeHandlers = useSwipe({
    onSwipeLeft: goPrevious,
    onSwipeRight: goNext,
    onSpace: mode === "revision" && temps && !revealed ? () => setRevealed(true) : undefined,
  });

  if (!verbe) return null;

  const conjugaisonsTemps = temps ? verbe.conjugaisons?.[temps] : null;

  return (
    <>
    {/* paddingBottom en unités "pré-zoom" (80px réels / 1.5) — cette section
        est elle-même zoomée, un padding en px réels serait donc étiré à
        120px au lieu des 80px de dégagement voulus sous les boutons
        next/previous (rendus hors de cette section, cf. plus bas). */}
    <section className="screen" style={{ zoom: 1.5, paddingBottom: 80 / 1.5 }} onPointerDown={swipeHandlers.onPointerDown}>
      <ActionHints {...swipeHandlers.hints} digits={mode === "revision" && !!temps && revealed} />

      {/* marginTop (wrapper extérieur, donc vu uniquement à travers le
          zoom:1.5 ambiant de .screen) rapproche le message de la borne
          inférieure du bandeau. zoom:0.5 (wrapper intérieur séparé, pour ne
          pas cumuler son propre facteur sur le marginTop ci-dessus) réduit
          la police de moitié — 0.7em est déclaré en inline sur PoolBadge,
          donc pas modifiable par une simple règle CSS sans !important,
          même technique que les autres redimensionnements ponctuels de
          composants partagés sur cet écran (ex: fiche binyan/racine).
          Cf. demandes explicites du user. */}
      {mode === "revision" && (
        <div style={{ marginTop: -27 }}>
          <div style={{ zoom: 0.5 }}>
            <PoolBadge pool={verbe.pool} chapter={verbe.chapter} lesson={verbe.lesson} />
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <h1 className="hebrew-large" style={{ margin: 0 }}>
          <button
            type="button"
            className="speak-btn"
            style={{ marginInlineEnd: 10, verticalAlign: "middle" }}
            onClick={() => speak(verbe.pure)}
          >
            <SpeakerIcon color="#64748b" />
          </button>
          {verbe.pure}
          <span
            className="binyan-pill"
            style={{ backgroundColor: verbe.binyan_color, cursor: "pointer" }}
            onClick={toggleBinyanInline}
          />
          <button
            type="button"
            className="speak-btn hebrew"
            style={{
              fontSize: "0.5em",
              marginInlineStart: 1,
              verticalAlign: "middle",
              color: verbe.binyan_color,
              fontWeight: 700,
            }}
            onClick={toggleBinyanInline}
          >
            ב
          </button>
          <span
            style={{
              color: "var(--textMuted)",
              fontWeight: 400,
              fontSize: "0.5em",
              marginInlineStart: 4,
              verticalAlign: "middle",
            }}
          >
            |
          </span>
          <button
            type="button"
            className="speak-btn hebrew"
            style={{
              fontSize: "0.5em",
              marginInlineStart: 4,
              verticalAlign: "middle",
              color: "#64748b",
              fontWeight: 700,
            }}
            onClick={toggleRacineInline}
          >
            ש
          </button>
        </h1>
        <p
          style={{
            margin: 0,
            fontStyle: "italic",
            fontWeight: 400,
            fontSize: "calc(var(--font-size-hebrew-large) * 0.4355)",
            color: "var(--textMuted)",
          }}
        >
          {capitalize(verbe.traduction)}
        </p>
      </div>

      {/* zoom: 1/1.5 (sur le div interne) annule le zoom:1.5 posé sur
          .screen — ces deux fiches doivent garder leur taille d'origine,
          seul le reste de l'écran a été agrandi. marginTop: -8 (sur le div
          externe, non zoomé, donc dans le même référentiel que le gap:16
          de .screen) réduit de moitié l'espace au-dessus de la fiche. */}
      {binyanDetails && (
        <div style={{ marginTop: -8 }}>
          <div className="card" style={{ textAlign: "center", zoom: 1 / 1.5 }}>
            <p className="hebrew-large" style={{ margin: 0, color: binyanDetails.color }}>
              {binyanDetails.text}
            </p>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              {binyanDetails.sens}
            </p>
          </div>
        </div>
      )}

      {/* RacineCard fixe elle-même marginTop: 40 sur sa racine (utile dans
          ses autres contextes — Dictionnaire, MotScreen) — vu à travers le
          zoom: 1/1.5 ci-dessous, ça vaut 40/1.5 ici. On l'annule en plus du
          -8 pour retomber au même niveau que la fiche binyan. */}
      {racineDetails && (
        <div style={{ marginTop: -8 - 40 / 1.5 }}>
          <div style={{ zoom: 1 / 1.5 }}>
            <RacineCard racine={racineDetails} />
          </div>
        </div>
      )}

      <div className="toggle-group" style={{ marginTop: binyanDetails || racineDetails ? 28 : 6 }}>
        {TEMPS_LABELS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={temps === t.key ? "active" : ""}
            style={
              temps === t.key
                ? { backgroundColor: verbe.binyan_color, borderColor: verbe.binyan_color }
                : undefined
            }
            onClick={() => openTemps(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <hr
        style={{
          width: "100%",
          maxWidth: 320,
          border: "none",
          borderTop: "1px solid var(--border)",
          margin: "1em 0 0",
        }}
      />

      {temps && !conjugaisonsTemps && (
        <p className="muted" style={{ fontStyle: "italic" }}>
          Conjugaison indisponible pour ce verbe.
        </p>
      )}

      {temps && conjugaisonsTemps && (
        <>
          {mode === "exploration" &&
            Object.values(conjugaisonsTemps).map((c) => (
              <div key={c.personne} style={{ marginBottom: "0.8em" }}>
                <p
                  className="hebrew-large"
                  style={{
                    margin: 0,
                    color: "var(--text)",
                    fontWeight: 600,
                    fontSize: "calc(var(--font-size-hebrew-large) * 0.8)",
                  }}
                >
                  {c.conjugaison}
                </p>
                <p
                  className="muted"
                  style={{ margin: "2px 0 0", fontStyle: "italic", fontSize: "0.612em" }}
                >
                  {capitalize(c.personne)}
                </p>
              </div>
            ))}

          {mode === "revision" && (
            <table
              style={{
                width: "100%",
                maxWidth: 320,
                borderCollapse: "collapse",
                marginTop: "1em",
                tableLayout: "fixed",
              }}
            >
              <tbody>
                <tr>
                  <td />
                  <td style={{ width: "50%", verticalAlign: "middle", textAlign: "center" }}>
                    {/* Toujours monté (visibility, pas de rendu conditionnel) pour
                        que la ligne garde la même hauteur, révélé ou non — sinon
                        les lignes du dessous (personne/conjugaison) se décalent. */}
                    <button
                      type="button"
                      className="speak-btn"
                      disabled={!revealed}
                      onClick={() => speak(conjugaisonsTemps[personneKey]?.conjugaison)}
                      style={{ visibility: revealed ? "visible" : "hidden" }}
                    >
                      <SpeakerIcon color="var(--text)" />
                    </button>
                  </td>
                </tr>
                <tr>
                  <td
                    style={{
                      width: "50%",
                      verticalAlign: "middle",
                      textAlign: "center",
                      fontStyle: "italic",
                      fontSize: "0.8em",
                    }}
                  >
                    {capitalize(conjugaisonsTemps[personneKey]?.personne ?? "")}
                  </td>
                  <td style={{ width: "50%", verticalAlign: "middle", textAlign: "center" }}>
                    {!revealed ? (
                      <button type="button" className="speak-btn" onClick={() => setRevealed(true)}>
                        <span className="racine-badge" style={{ background: "#000", fontWeight: 700, padding: "3px 10px", fontSize: "0.85em" }}>
                          ?
                        </span>
                      </button>
                    ) : (
                      <p
                        className="hebrew-large"
                        style={{
                          margin: 0,
                          textAlign: "center",
                          fontSize: "calc(var(--font-size-hebrew-large) * 0.8)",
                        }}
                      >
                        {conjugaisonsTemps[personneKey]?.conjugaison}
                      </p>
                    )}
                  </td>
                </tr>
                <tr>
                  <td />
                  <td style={{ textAlign: "center" }}>
                    {revealed && (
                      <div style={{ display: "flex", justifyContent: "center", gap: 0 }}>
                        <button
                          type="button"
                          className={`eval-btn danger${pulse === "danger" ? " pulse" : ""}`}
                          onClick={() => handleEvaluate(false)}
                        >
                          ✗
                        </button>
                        <button
                          type="button"
                          className={`eval-btn success${pulse === "success" ? " pulse" : ""}`}
                          onClick={() => handleEvaluate(true)}
                        >
                          ✓
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
    <NextPrevButtons onPrevious={goPrevious} onNext={goNext} />
    </>
  );
}
