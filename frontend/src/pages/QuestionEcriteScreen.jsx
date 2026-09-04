import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getRandomPhrase } from "../api/content";
import { getNiveau, createEvaluation, markObjectSeen } from "../api/user";
import { evaluateTranslation } from "../api/gemini";
import { useSwipe } from "../hooks/useSwipe";
import { useRandomBrowser } from "../hooks/useRandomBrowser";
import { speak } from "../utils/speech";
import HebrewInput from "../components/HebrewInput";
import { VoicePrefill } from "../components/VoicePrefill";
import { LabeledTile } from "../components/LabeledTile";
import { ActionHints } from "../components/ActionHints";
import { BottomNavBar, BottomNavToggle } from "../components/BottomNavBar";
import { SpeakerIcon } from "../components/SpeakerIcon";
import { WaitingVideo } from "../components/WaitingVideo";
import "./screens.css";

// Les observations sont affichées en italique, mais un mot en hébreu au
// milieu d'une phrase française perd en lisibilité en italique — on l'en
// exempte pour qu'il ressorte mieux (cf. QuestionOraleScreen, même logique).
function renderWithHebrewHighlight(text) {
  return text
    .split(/([֐-׿]+(?:[\s'"־][֐-׿]+)*)/g)
    .map((part, i) =>
      /[֐-׿]/.test(part) ? (
        <span key={i} className="hebrew" style={{ fontStyle: "normal" }}>
          {part}
        </span>
      ) : (
        part
      )
    );
}

function StarRating({ rating }) {
  return (
    <span aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ color: i <= rating ? "#f5b301" : "var(--textMuted)" }}>
          ★
        </span>
      ))}
    </span>
  );
}

export default function QuestionEcriteScreen() {
  const { code } = useParams(); // présent seulement si venu par une leçon précise
  const [niveau, setNiveau] = useState(null);
  const [direction, setDirection] = useState("hebreu"); // francais | hebreu — sens de traduction pratiqué
  const [evalMode, setEvalMode] = useState("auto"); // auto | prof
  const [revealed, setRevealed] = useState(false);
  const [studentSolution, setStudentSolution] = useState("");
  const [geminiResult, setGeminiResult] = useState(null);
  const [geminiError, setGeminiError] = useState(null);
  const [loadingGemini, setLoadingGemini] = useState(false);
  const [pulse, setPulse] = useState(null); // "success" | "danger" | null

  // Le mode découle du chemin d'accès, cf. MotScreen.
  const mode = code ? "exploration" : "revision";

  useEffect(() => {
    getNiveau().then(setNiveau);
  }, []);

  const lessonCode = code ?? niveau?.reference_lesson;

  const { current: phrase, next, back } = useRandomBrowser(
    (prevPhrase, seen) =>
      lessonCode
        ? getRandomPhrase(lessonCode, mode, prevPhrase?.position, direction, seen)
        : Promise.resolve(null),
    [lessonCode, mode, direction]
  );

  useEffect(() => {
    setRevealed(false);
    setStudentSolution("");
    setGeminiResult(null);
    setGeminiError(null);
    setPulse(null);
  }, [phrase, evalMode]);

  // Progression d'exploration de la leçon (cf. GET /api/lecons/{code}/
  // exploration) : une "traduction" = une phrase, quel que soit le sens
  // affiché, donc pas de direction dans la clé.
  useEffect(() => {
    if (phrase) markObjectSeen({ objectType: "phrase", objectKey: `${phrase.lesson_code}|${phrase.position}` });
  }, [phrase]);

  // Anime brièvement le bouton choisi avant de passer à la phrase suivante,
  // cf. MotScreen::handleEvaluate (même logique).
  function handleEvaluate(success) {
    setPulse(success ? "success" : "danger");
    createEvaluation({
      objectType: "phrase_auto",
      objectKey: `${phrase.lesson_code}|${phrase.position}|${phrase.direction}`,
      success,
    }).then(() => {
      setTimeout(() => {
        setPulse(null);
        next();
      }, 350);
    });
  }

  async function handleSubmitProf() {
    setLoadingGemini(true);
    setGeminiError(null);
    try {
      const result = await evaluateTranslation({
        lessonCode: phrase.lesson_code,
        position: phrase.position,
        direction: phrase.direction,
        studentSolution,
      });
      setGeminiResult(result);
    } catch (e) {
      setGeminiError(e.message);
    } finally {
      setLoadingGemini(false);
    }
  }

  useEffect(() => {
    if (mode !== "revision" || evalMode !== "auto" || !revealed) return;
    function handleKeyDown(e) {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "1") handleEvaluate(true);
      else if (e.key === "0") handleEvaluate(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, evalMode, revealed, phrase]);

  // Sur la toute première phrase de la session (pas encore d'historique),
  // back() ne fait rien plutôt que de sortir de l'écran (navigate(-1)) :
  // previous/next ne doivent jamais faire quitter le type d'objet
  // parcouru, cf. demande explicite du user.
  function goPrevious() {
    back();
  }
  function goNext() {
    next();
  }

  const swipeHandlers = useSwipe({
    onSwipeLeft: goPrevious,
    onSwipeRight: goNext,
    onSpace:
      mode === "revision" && evalMode === "auto" && !revealed
        ? () => setRevealed(true)
        : mode === "revision" && evalMode === "prof" && geminiResult
        ? () => next()
        : undefined,
  });

  // 50% du temps, la phrase hébraïque s'affiche en écriture cursive (כתב יד)
  // plutôt qu'en police carrée, pour habituer les étudiants à la reconnaître.
  const isCursive = useMemo(() => Math.random() < 0.5, [phrase]);

  if (!phrase) return null;

  const isSourceHebrew = phrase.direction === "francais";
  const sourceText = isSourceHebrew ? phrase.hebrew : phrase.french;
  const targetText = isSourceHebrew ? phrase.french : phrase.hebrew;
  const targetIsHebrew = !isSourceHebrew;

  // Remplace les anciens boutons radio (sens de traduction + mode
  // d'évaluation) — deux toggles sur la barre de contrôle inférieure, cf.
  // demande explicite du user.
  const revisionToggles = mode === "revision" && (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <BottomNavToggle
        leftLabel="FR"
        rightLabel="HE"
        value={direction === "hebreu"}
        onChange={(isHebreu) => setDirection(isHebreu ? "hebreu" : "francais")}
      />
      <BottomNavToggle
        leftLabel="Auto"
        rightLabel="Teacher"
        value={evalMode === "prof"}
        onChange={(isProf) => setEvalMode(isProf ? "prof" : "auto")}
      />
    </div>
  );

  return (
    <section className="screen" style={{ paddingBottom: "calc(var(--bottom-nav-height) * 2)", flex: 1 }} onPointerDown={swipeHandlers.onPointerDown}>
      {loadingGemini ? (
        <WaitingVideo />
      ) : (
        <>
      <ActionHints
        {...swipeHandlers.hints}
        digits={mode === "revision" && evalMode === "auto" && revealed}
      />
      <BottomNavBar onPrevious={goPrevious} onNext={goNext} center={revisionToggles} />


      {/* Phrase française toujours au-dessus du trait, phrase hébreu
          toujours en dessous (avec son haut-parleur) — cf. demande
          explicite du user. Bloc centré au milieu de l'écran (largeur et
          hauteur, desktop comme mobile) via flex:1 + justifyContent:center
          sur ce conteneur (la section porte déjà flex:1). */}
      {mode === "exploration" && (
        <div
          style={{
            flex: 1,
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <p style={{ fontStyle: "italic", color: "var(--textMuted)", margin: 0, fontSize: "1.152em" }}>
            {phrase.french}
          </p>
          <hr
            style={{
              width: "70%",
              maxWidth: 320,
              border: "none",
              borderTop: "1px solid var(--border)",
              margin: 0,
            }}
          />
          <p
            className="hebrew"
            style={{
              margin: 0,
              fontWeight: 700,
              color: "var(--text)",
              fontSize: "2.16em",
              direction: "rtl",
              fontFamily: isCursive ? "'Gveret Levin', cursive" : undefined,
            }}
          >
            {phrase.hebrew}
          </p>
          {/* marginTop en plus du gap:10 du flex column ambiant — augmente
              spécifiquement l'espace phrase hébreu -> haut-parleur, sans
              toucher aux autres écarts (français -> trait -> hébreu), cf.
              demande explicite du user. */}
          <button
            type="button"
            className="speak-btn"
            style={{ marginTop: 24 }}
            onClick={() => speak(phrase.hebrew)}
          >
            <SpeakerIcon size={30} color="var(--text)" />
          </button>
        </div>
      )}

      {mode === "revision" && (
        <>
          {evalMode === "prof" && (
            <LabeledTile label="Traduire la phrase">
              {isSourceHebrew ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <p
                    className="hebrew"
                    style={{
                      margin: 0,
                      fontWeight: 700,
                      color: "var(--text)",
                      fontSize: "1.44em",
                      direction: "rtl",
                      fontFamily: isCursive ? "'Gveret Levin', cursive" : undefined,
                    }}
                  >
                    {sourceText}
                  </p>
                  <span style={{ color: "var(--textMuted)", fontWeight: 400 }}>|</span>
                  <button type="button" className="speak-btn" onClick={() => speak(phrase.hebrew)}>
                    <SpeakerIcon size={20.25} color="var(--textMuted)" />
                  </button>
                </div>
              ) : (
                <p style={{ color: "var(--text)", margin: 0, fontSize: "0.96em" }}>{sourceText}</p>
              )}
            </LabeledTile>
          )}
        </>
      )}

      {mode === "revision" && evalMode === "auto" && (
        <div
          style={{
            flex: 1,
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* La phrase donnée (source) est toujours au-dessus du trait, la
              solution (cible à deviner) toujours en dessous — même
              principe que MotScreen/révisions. marginBottom:14 des deux
              côtés (hébreu comme français) : le trait doit être à
              équidistance des deux phrases, cf. demande explicite du user.
              Haut-parleur au-dessus de la phrase hébreu (pas en dessous),
              cf. demande explicite du user. */}
          {isSourceHebrew ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginBottom: 14 }}>
              {/* size 33 = 22 * 1.5 (+50%), cf. demande explicite du
                  user. */}
              <button type="button" className="speak-btn" onClick={() => speak(phrase.hebrew)}>
                <SpeakerIcon size={33} color="var(--textMuted)" />
              </button>
              {/* Phrase hébreu toujours en noir (jamais grisée), cf.
                  demande explicite du user. */}
              <p
                className="hebrew"
                style={{
                  margin: 0,
                  fontWeight: 700,
                  color: "var(--text)",
                  fontSize: "2.16em",
                  direction: "rtl",
                  fontFamily: isCursive ? "'Gveret Levin', cursive" : undefined,
                }}
              >
                {sourceText}
              </p>
            </div>
          ) : (
            <p style={{ color: "var(--text)", margin: 0, marginBottom: 14, fontSize: "1.44em", textAlign: "center" }}>
              {sourceText}
            </p>
          )}

          <hr
            style={{
              width: "70%",
              maxWidth: 320,
              border: "none",
              borderTop: "1px solid var(--border)",
              margin: 0,
            }}
          />

          {/* Zone de révélation à hauteur fixe : le "?" et la solution
              occupent la même cellule de grille (l'un en visibility:hidden,
              l'autre visible) — la hauteur de la cellule est donc toujours
              celle du contenu le plus grand (la solution), qu'elle soit
              affichée ou non. La phrase source et le trait au-dessus ne
              bougent ainsi jamais lors de la révélation, cf. demande
              explicite du user. Le "?" (badge, aligné en haut de la
              cellule) reçoit toujours l'espacement complet ; le bloc
              "révélé" reçoit systématiquement le même marginTop réduit
              (-14, qu'il soit en français ou en hébreu) pour que l'écart
              trait -> solution soit identique à l'écart source -> trait
              (marginBottom:14 côté source), cf. demande explicite du
              user. */}
          <div style={{ display: "grid", justifyItems: "center", marginTop: 28 }}>
            <div
              style={{
                gridArea: "1 / 1",
                visibility: revealed ? "hidden" : "visible",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "center",
                marginTop: 9,
              }}
            >
              <button type="button" className="speak-btn" onClick={() => setRevealed(true)} disabled={revealed}>
                <span
                  className="racine-badge"
                  style={{ background: "#000", fontWeight: 700, fontSize: "1.4em", padding: "10px 24px" }}
                >
                  ?
                </span>
              </button>
            </div>

            <div
              style={{
                gridArea: "1 / 1",
                visibility: revealed ? "visible" : "hidden",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                marginTop: -14,
              }}
            >
              {targetIsHebrew ? (
                <p
                  className="hebrew"
                  style={{
                    margin: 0,
                    fontWeight: 700,
                    color: "var(--text)",
                    fontSize: "2.16em",
                    direction: "rtl",
                    fontFamily: isCursive ? "'Gveret Levin', cursive" : undefined,
                  }}
                >
                  {targetText}
                </p>
              ) : (
                // Phrase française toujours en gris (jamais noire), cf.
                // demande explicite du user.
                <p style={{ fontStyle: "italic", color: "var(--textMuted)", margin: 0, fontSize: "1.44em", textAlign: "center" }}>
                  {targetText}
                </p>
              )}

              {/* Haut-parleur (si la cible est en hébreu), wrong.png et
                  right.png (au lieu des glyphes ✗/✓ texte) sur la même
                  ligne — cf. demande explicite du user. className
                  danger/success conservée (couleur du bouton lui-même, pas
                  de l'image) pour que le halo .pulse (box-shadow en
                  currentColor) continue de fonctionner sans changement.
                  marginTop:32 (avec le gap:8 du conteneur, 40px au total)
                  quelle que soit la cible (français ou hébreu) : même
                  espace phrase -> logos des deux côtés, cf. demandes
                  explicites du user. */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  marginTop: 32,
                }}
              >
                {targetIsHebrew && (
                  <button type="button" className="speak-btn" onClick={() => speak(phrase.hebrew)}>
                    <SpeakerIcon size={44} color="var(--text)" />
                  </button>
                )}
                <button
                  type="button"
                  className={`eval-btn danger${pulse === "danger" ? " pulse" : ""}`}
                  onClick={() => handleEvaluate(false)}
                >
                  <img src="/wrong.png" alt="Faux" width={36} height={36} draggable={false} />
                </button>
                <button
                  type="button"
                  className={`eval-btn success${pulse === "success" ? " pulse" : ""}`}
                  onClick={() => handleEvaluate(true)}
                >
                  <img src="/right.png" alt="Vrai" width={36} height={36} draggable={false} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {mode === "revision" && evalMode === "prof" && (
        <>
          {!geminiResult && (
            <>
              {targetIsHebrew ? (
                <>
                  <LabeledTile label="Pré-remplir avec la voix (optionnel)">
                    <VoicePrefill
                      key={`${phrase.lesson_code}-${phrase.position}-${phrase.direction}`}
                      lang="he"
                      onChange={setStudentSolution}
                    />
                  </LabeledTile>
                  <LabeledTile label="Réponse">
                    <HebrewInput
                      key={`${phrase.lesson_code}-${phrase.position}-${phrase.direction}`}
                      value={studentSolution}
                      onChange={setStudentSolution}
                      rows={3}
                      showVoicePrefill={false}
                    />
                  </LabeledTile>
                </>
              ) : (
                <LabeledTile label="Réponse">
                  <textarea
                    className="translate-textarea"
                    value={studentSolution}
                    onChange={(e) => setStudentSolution(e.target.value)}
                    rows={3}
                    style={{ width: "100%", fontFamily: "inherit" }}
                  />
                </LabeledTile>
              )}
              {!loadingGemini && (
                <button
                  type="button"
                  className="exam-tile green"
                  style={{ marginTop: 0, cursor: studentSolution.trim() ? "pointer" : "default" }}
                  disabled={!studentSolution.trim()}
                  onClick={handleSubmitProf}
                >
                  Envoyer ma réponse
                </button>
              )}
              {geminiError && (
                <p className="muted" style={{ color: "var(--danger)" }}>
                  {geminiError}
                </p>
              )}
            </>
          )}

          {geminiResult && targetIsHebrew && (
            <>
              <p className="hebrew" style={{ fontSize: "0.8em", margin: 0, marginTop: "1.5em" }}>
                <span style={{ color: "var(--text)" }}>Réponse de l'étudiant : </span>
                <span style={{ fontStyle: "italic", color: "var(--textMuted)" }}>
                  {geminiResult.translation}
                </span>
              </p>

              <hr
                style={{ width: "100%", border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }}
              />

              <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 320 }}>
                <tbody>
                  <tr>
                    <td style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}>
                      Note
                    </td>
                    <td style={{ border: "1px solid transparent", padding: "4px 8px" }}>
                      <StarRating rating={geminiResult.score} />
                    </td>
                  </tr>
                  {geminiResult.observations.length > 0 && (
                    <tr>
                      <td
                        colSpan={2}
                        style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}
                      >
                        <ul
                          style={{
                            margin: 0,
                            paddingInlineStart: "1.2em",
                            fontStyle: "italic",
                            fontSize: "0.85em",
                            color: "var(--textMuted)",
                          }}
                        >
                          {geminiResult.observations.map((obs, i) => (
                            <li key={i}>{renderWithHebrewHighlight(obs)}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <hr
                style={{ width: "100%", border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }}
              />

              <button
                type="button"
                className="link-btn"
                style={{
                  fontStyle: "italic",
                  color: "var(--textMuted)",
                  fontSize: "0.96em",
                  textDecoration: "none",
                }}
                onClick={next}
              >
                Question suivante
              </button>
            </>
          )}

          {geminiResult && !targetIsHebrew && (
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

              <hr
                style={{ width: "100%", border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }}
              />

              <button
                type="button"
                className="link-btn"
                style={{
                  fontStyle: "italic",
                  color: "var(--textMuted)",
                  fontSize: "0.96em",
                  textDecoration: "none",
                }}
                onClick={next}
              >
                Question suivante
              </button>
            </>
          )}
        </>
      )}
        </>
      )}
    </section>
  );
}
