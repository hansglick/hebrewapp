import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getRandomPhrase } from "../api/content";
import { getNiveau, createEvaluation, markObjectSeen } from "../api/user";
import { evaluateTranslation } from "../api/gemini";
import { useSwipe } from "../hooks/useSwipe";
import { useRandomBrowser } from "../hooks/useRandomBrowser";
import { speak } from "../utils/speech";
import HebrewInput from "../components/HebrewInput";
import { ActionHints } from "../components/ActionHints";
import { NextPrevButtons } from "../components/NextPrevButtons";
import { SpeakerIcon } from "../components/SpeakerIcon";
import { WaitingVideo } from "../components/WaitingVideo";
import { PoolBadge } from "../components/PoolBadge";
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
  const navigate = useNavigate();
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
    (prevPhrase) =>
      lessonCode
        ? getRandomPhrase(lessonCode, mode, prevPhrase?.position, direction)
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

  function goPrevious() {
    if (!back()) navigate(-1);
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

  return (
    <section className="screen" style={{ paddingBottom: 80, flex: 1 }} onPointerDown={swipeHandlers.onPointerDown}>
      {loadingGemini ? (
        <WaitingVideo />
      ) : (
        <>
      <ActionHints
        {...swipeHandlers.hints}
        digits={mode === "revision" && evalMode === "auto" && revealed}
      />
      {/* En exploration, les boutons sont placés au-dessus de la phrase
          française (cf. plus bas, variante `static`) plutôt qu'au centre
          générique de l'écran, cf. demande explicite du user. */}
      {mode === "revision" && <NextPrevButtons onPrevious={goPrevious} onNext={goNext} />}

      {mode === "revision" && (
        <div style={{ marginTop: -20 }}>
          <PoolBadge pool={phrase.pool} chapter={phrase.chapter} lesson={phrase.lesson} />
        </div>
      )}

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
          <NextPrevButtons onPrevious={goPrevious} onNext={goNext} variant="static" />
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
          <button type="button" className="speak-btn" onClick={() => speak(phrase.hebrew)}>
            <SpeakerIcon size={30} color="var(--text)" />
          </button>
        </div>
      )}

      {mode === "revision" && (
        <>
          <div className="radio-group" style={{ marginTop: -8, marginBottom: -8 }}>
            <label style={{ fontSize: "0.475em", color: "var(--textMuted)" }}>
              <input
                type="radio"
                name="direction"
                checked={direction === "francais"}
                onChange={() => setDirection("francais")}
              />
              Français
            </label>
            <label style={{ fontSize: "0.475em", color: "var(--textMuted)" }}>
              <input
                type="radio"
                name="direction"
                checked={direction === "hebreu"}
                onChange={() => setDirection("hebreu")}
              />
              Hébreu
            </label>
          </div>

          <div className="radio-group" style={{ marginTop: -8, marginBottom: -16 }}>
            <label style={{ fontSize: "0.475em", color: "var(--textMuted)" }}>
              <input
                type="radio"
                name="evalMode"
                checked={evalMode === "auto"}
                onChange={() => setEvalMode("auto")}
              />
              Auto-éval
            </label>
            <label style={{ fontSize: "0.475em", color: "var(--textMuted)" }}>
              <input
                type="radio"
                name="evalMode"
                checked={evalMode === "prof"}
                onChange={() => setEvalMode("prof")}
              />
              Prof éval
            </label>
          </div>

          {evalMode === "prof" && (
            <>
              <hr
                style={{
                  width: "100%",
                  maxWidth: 320,
                  border: "none",
                  borderTop: "1px solid var(--border)",
                  margin: "1em 0 0",
                }}
              />

              {isSourceHebrew ? (
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <p
                    className="hebrew"
                    style={{
                      margin: 0,
                      fontWeight: 700,
                      color: "var(--textMuted)",
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
                <p style={{ color: "var(--text)", margin: "1em 0 0", fontSize: "0.96em" }}>
                  {sourceText}
                </p>
              )}
            </>
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
              principe que MotScreen/révisions. Marges explicites (gap:0 sur
              le conteneur) plutôt qu'un gap uniforme : à distance de boîte
              égale, la police latine laisse plus d'espace de ligne visible
              au-dessus du texte que la police hébraïque ou le badge "?" —
              sans ce correctif le trait paraît plus proche du côté hébreu
              que du côté français, cf. demande explicite du user. */}
          {isSourceHebrew ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginBottom: 28 }}>
              <p
                className="hebrew"
                style={{
                  margin: 0,
                  fontWeight: 700,
                  color: "var(--textMuted)",
                  fontSize: "2.16em",
                  direction: "rtl",
                  fontFamily: isCursive ? "'Gveret Levin', cursive" : undefined,
                }}
              >
                {sourceText}
              </p>
              <button type="button" className="speak-btn" onClick={() => speak(phrase.hebrew)}>
                <SpeakerIcon size={22} color="var(--textMuted)" />
              </button>
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
              cellule) reçoit toujours l'espacement complet (comme
              l'hébreu) ; le bloc "révélé" reçoit un marginTop réduit
              lorsque la cible est en français (même raison que côté
              source). */}
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
                marginTop: targetIsHebrew ? 0 : -14,
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
                <p style={{ fontStyle: "italic", color: "var(--text)", margin: 0, fontSize: "1.44em", textAlign: "center" }}>
                  {targetText}
                </p>
              )}

              {/* Haut-parleur (si la cible est en hébreu), cross mark et
                  check mark sur la même ligne, tous à +100% — cf. demande
                  explicite du user. */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {targetIsHebrew && (
                  <button type="button" className="speak-btn" onClick={() => speak(phrase.hebrew)}>
                    <SpeakerIcon size={44} color="var(--text)" />
                  </button>
                )}
                <button
                  type="button"
                  className={`eval-btn danger${pulse === "danger" ? " pulse" : ""}`}
                  style={{ fontSize: "2.14em" }}
                  onClick={() => handleEvaluate(false)}
                >
                  ✗
                </button>
                <button
                  type="button"
                  className={`eval-btn success${pulse === "success" ? " pulse" : ""}`}
                  style={{ fontSize: "2.14em" }}
                  onClick={() => handleEvaluate(true)}
                >
                  ✓
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
                <HebrewInput
                  key={`${phrase.lesson_code}-${phrase.position}-${phrase.direction}`}
                  value={studentSolution}
                  onChange={setStudentSolution}
                  rows={3}
                />
              ) : (
                <textarea
                  className="translate-textarea"
                  value={studentSolution}
                  onChange={(e) => setStudentSolution(e.target.value)}
                  rows={3}
                  style={{ width: "100%", maxWidth: 320, fontFamily: "inherit" }}
                />
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
