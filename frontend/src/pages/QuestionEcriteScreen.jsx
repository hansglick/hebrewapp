import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { getRandomPhrase } from "../api/content";
import { getNiveau, createEvaluation, markObjectSeen } from "../api/user";
import { evaluateTranslation } from "../api/gemini";
import { useSwipe } from "../hooks/useSwipe";
import { useRandomBrowser } from "../hooks/useRandomBrowser";
import { speak } from "../utils/speech";
import HebrewInput from "../components/HebrewInput";
import { QuoteBlock, SectionTitle } from "../components/QuoteBlock";
import { ActionHints } from "../components/ActionHints";
import { BottomNavBar, BottomNavToggle } from "../components/BottomNavBar";
import { SpeakerIcon } from "../components/SpeakerIcon";
import { WaitingVideo } from "../components/WaitingVideo";
import { PageTurnCurl, PAGE_TURN_TOTAL_DURATION_MS } from "../components/PageTurnCurl";
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
        <span key={i} style={{ color: i <= rating ? "#f5b301" : "var(--textSecondary)" }}>
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
  const [flip, setFlip] = useState(null); // { dir, phrase, phase: "start" | "animating" }
  const flipTimeoutRef = useRef(null);

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

  // Animation "tourner la page" (cf. PageTurnCurl, déjà appliquée aux
  // mots/verbes/curiosités) — leçon ET révisions, cf. demande explicite du
  // user ("tous les objets présents dans révisions qui sont itérables").
  // Le snapshot regroupe tout l'état visuel pertinent (pas seulement la
  // phrase), utilisé par renderRevisionCard pour la page "sortante" en
  // révisions — cf. QuestionOraleScreen::renderQuestionCard, même
  // principe. En exploration, seuls `phrase`/`isCursive` sont utilisés par
  // renderExplorationPhrase, le reste du snapshot est ignoré.
  function startFlip(dir) {
    if (flip || !phrase) return;
    setFlip({
      dir,
      snapshot: { phrase, isCursive, evalMode, revealed, studentSolution, geminiResult, geminiError, pulse },
      phase: "start",
    });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setFlip((f) => (f ? { ...f, phase: "animating" } : f));
      });
    });
    clearTimeout(flipTimeoutRef.current);
    flipTimeoutRef.current = setTimeout(() => setFlip(null), PAGE_TURN_TOTAL_DURATION_MS);
  }

  // Sur la toute première phrase de la session (pas encore d'historique),
  // back() ne fait rien plutôt que de sortir de l'écran (navigate(-1)) :
  // previous/next ne doivent jamais faire quitter le type d'objet
  // parcouru, cf. demande explicite du user.
  function goPrevious() {
    if (flip) return;
    const moved = back();
    if (moved) startFlip("prev");
  }
  function goNext() {
    if (flip) return;
    startFlip("next");
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

  // Rendu d'une phrase en exploration (français/trait/hébreu/haut-parleur)
  // — utilisé pour la page au repos et, via PageTurnCurl, pour la page
  // "sortante" pendant l'animation, cf. demande explicite du user. `cursive`
  // est passé explicitement (pas lu sur la variable isCursive du render
  // courant) : sinon, dès que la nouvelle phrase arrive, isCursive change
  // pour TOUT LE MONDE — y compris la page sortante, qui afficherait alors
  // encore l'ANCIEN texte mais avec une police soudainement différente
  // (cursive <-> carrée), donc un texte qui change de taille/saute en
  // pleine animation — cf. bug rapporté par le user.
  function renderExplorationPhrase(cardPhrase, cursive) {
    return (
      <div
        className="page-turn-card"
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--bg)",
          overflowY: "auto",
          backfaceVisibility: "hidden",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}
      >
        <p style={{ fontStyle: "italic", color: "var(--textSecondary)", margin: 0, fontSize: "1.152em" }}>
          {cardPhrase.french}
        </p>
        <hr
          style={{
            width: "70%",
            maxWidth: 320,
            border: "none",
            borderTop: "1px solid var(--cardBorder)",
            margin: 0,
          }}
        />
        <p
          className="hebrew"
          style={{
            margin: 0,
            fontWeight: 700,
            color: "var(--textPrimary)",
            fontSize: "2.16em",
            direction: "rtl",
            fontFamily: cursive ? "'Gveret Levin', cursive" : undefined,
          }}
        >
          {cardPhrase.hebrew}
        </p>
        <button
          type="button"
          className="speak-btn"
          style={{ marginTop: 24 }}
          onClick={() => speak(cardPhrase.hebrew)}
        >
          <SpeakerIcon size={30} color="var(--speakerIcon)" />
        </button>
      </div>
    );
  }

  // Rendu d'une carte de révision (les deux evalMode confondus) — utilisé
  // pour la page au repos et, via PageTurnCurl, pour la page "sortante"
  // pendant l'animation "tourner la page" (leçon ET révisions, cf.
  // demande explicite du user "tous les objets présents dans révisions qui
  // sont itérables"). `snap` regroupe tout l'état visuel pertinent (pas
  // seulement la phrase) pour que la page sortante reste fidèle à ce qui
  // était affiché au moment de la quitter — même principe que
  // QuestionOraleScreen::renderQuestionCard. Les handlers (onClick/
  // onChange) restent branchés sur l'état LIVE du composant (pas sur le
  // snapshot) : cohérent avec le reste de l'écran, la page sortante n'est
  // de toute façon pas destinée à être manipulée pendant l'animation.
  function renderRevisionCard(snap) {
    const cardPhrase = snap.phrase;
    const cursive = snap.isCursive;
    const cardEvalMode = snap.evalMode;
    const cardRevealed = snap.revealed;
    const cardStudentSolution = snap.studentSolution;
    const cardGeminiResult = snap.geminiResult;
    const cardGeminiError = snap.geminiError;
    const cardPulse = snap.pulse;

    const isSourceHebrew = cardPhrase.direction === "francais";
    const sourceText = isSourceHebrew ? cardPhrase.hebrew : cardPhrase.french;
    const targetText = isSourceHebrew ? cardPhrase.french : cardPhrase.hebrew;
    const targetIsHebrew = !isSourceHebrew;

    return (
      <div
        className="page-turn-card"
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--bg)",
          overflowY: "auto",
          backfaceVisibility: "hidden",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {cardEvalMode === "prof" && (
          <QuoteBlock>
            {isSourceHebrew ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <p
                  className="hebrew"
                  style={{
                    margin: 0,
                    fontWeight: 700,
                    color: "var(--textSecondary)",
                    fontSize: "1.44em",
                    direction: "rtl",
                    fontFamily: cursive ? "'Gveret Levin', cursive" : undefined,
                  }}
                >
                  {sourceText}
                </p>
                <span style={{ color: "var(--cardBorder)", fontWeight: 400 }}>|</span>
                <button type="button" className="speak-btn" onClick={() => speak(cardPhrase.hebrew)}>
                  <SpeakerIcon size={20.25} color="var(--speakerIcon)" />
                </button>
              </div>
            ) : (
              <p style={{ color: "var(--textSecondary)", margin: 0, fontSize: "0.96em", fontStyle: "italic" }}>
                {sourceText}
              </p>
            )}
          </QuoteBlock>
        )}

        {cardEvalMode === "auto" && (
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
            {isSourceHebrew ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginBottom: 14 }}>
                <button type="button" className="speak-btn" onClick={() => speak(cardPhrase.hebrew)}>
                  <SpeakerIcon size={33} color="var(--speakerIcon)" />
                </button>
                <p
                  className="hebrew"
                  style={{
                    margin: 0,
                    fontWeight: 700,
                    color: "var(--textPrimary)",
                    fontSize: "2.16em",
                    direction: "rtl",
                    fontFamily: cursive ? "'Gveret Levin', cursive" : undefined,
                  }}
                >
                  {sourceText}
                </p>
              </div>
            ) : (
              <p style={{ color: "var(--textPrimary)", margin: 0, marginBottom: 14, fontSize: "1.44em", textAlign: "center" }}>
                {sourceText}
              </p>
            )}

            <hr
              style={{
                width: "70%",
                maxWidth: 320,
                border: "none",
                borderTop: "1px solid var(--cardBorder)",
                margin: 0,
              }}
            />

            <div style={{ display: "grid", justifyItems: "center", marginTop: 28 }}>
              <div
                style={{
                  gridArea: "1 / 1",
                  visibility: cardRevealed ? "hidden" : "visible",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "center",
                  marginTop: 9,
                }}
              >
                <button type="button" className="speak-btn" onClick={() => setRevealed(true)} disabled={cardRevealed}>
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
                  visibility: cardRevealed ? "visible" : "hidden",
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
                      color: "var(--textPrimary)",
                      fontSize: "2.16em",
                      direction: "rtl",
                      fontFamily: cursive ? "'Gveret Levin', cursive" : undefined,
                    }}
                  >
                    {targetText}
                  </p>
                ) : (
                  <p style={{ fontStyle: "italic", color: "var(--textSecondary)", margin: 0, fontSize: "1.44em", textAlign: "center" }}>
                    {targetText}
                  </p>
                )}

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
                    <button type="button" className="speak-btn" onClick={() => speak(cardPhrase.hebrew)}>
                      <SpeakerIcon size={44} color="var(--speakerIcon)" />
                    </button>
                  )}
                  <button
                    type="button"
                    className={`eval-btn danger${cardPulse === "danger" ? " pulse" : ""}`}
                    onClick={() => handleEvaluate(false)}
                  >
                    <img src="/wrong.png" alt="Faux" width={36} height={36} draggable={false} />
                  </button>
                  <button
                    type="button"
                    className={`eval-btn success${cardPulse === "success" ? " pulse" : ""}`}
                    onClick={() => handleEvaluate(true)}
                  >
                    <img src="/right.png" alt="Vrai" width={36} height={36} draggable={false} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {cardEvalMode === "prof" && (
          <>
            {!cardGeminiResult && (
              <>
                {targetIsHebrew ? (
                  <div style={{ width: "100%", maxWidth: 320, marginTop: 20 }}>
                    <SectionTitle>Réponse</SectionTitle>
                    <HebrewInput
                      key={`${cardPhrase.lesson_code}-${cardPhrase.position}-${cardPhrase.direction}`}
                      value={cardStudentSolution}
                      onChange={setStudentSolution}
                      rows={3}
                    />
                  </div>
                ) : (
                  <div style={{ width: "100%", maxWidth: 320, marginTop: 20 }}>
                    <SectionTitle>Réponse</SectionTitle>
                    <textarea
                      className="translate-textarea"
                      value={cardStudentSolution}
                      onChange={(e) => setStudentSolution(e.target.value)}
                      rows={3}
                      style={{ width: "100%", fontFamily: "inherit" }}
                    />
                  </div>
                )}
                {!loadingGemini && (
                  <button
                    type="button"
                    className="exam-tile green"
                    style={{ marginTop: 24, cursor: cardStudentSolution.trim() ? "pointer" : "default" }}
                    disabled={!cardStudentSolution.trim()}
                    onClick={handleSubmitProf}
                  >
                    Envoyer ma réponse
                  </button>
                )}
                {cardGeminiError && (
                  <p className="muted" style={{ color: "var(--annulationPleine)" }}>
                    {cardGeminiError}
                  </p>
                )}
              </>
            )}

            {cardGeminiResult && targetIsHebrew && (
              <>
                <p className="hebrew" style={{ fontSize: "0.8em", margin: 0, marginTop: "1.5em" }}>
                  <span style={{ color: "var(--textPrimary)" }}>Réponse de l'étudiant : </span>
                  <span style={{ fontStyle: "italic", color: "var(--textSecondary)" }}>
                    {cardGeminiResult.translation}
                  </span>
                </p>

                <hr
                  style={{ width: "100%", border: "none", borderTop: "1px solid var(--cardBorder)", margin: "12px 0" }}
                />

                <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 320 }}>
                  <tbody>
                    <tr>
                      <td style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}>
                        Note
                      </td>
                      <td style={{ border: "1px solid transparent", padding: "4px 8px" }}>
                        <StarRating rating={cardGeminiResult.score} />
                      </td>
                    </tr>
                    {cardGeminiResult.observations.length > 0 && (
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
                              color: "var(--textSecondary)",
                            }}
                          >
                            {cardGeminiResult.observations.map((obs, i) => (
                              <li key={i}>{renderWithHebrewHighlight(obs)}</li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <hr
                  style={{ width: "100%", border: "none", borderTop: "1px solid var(--cardBorder)", margin: "12px 0" }}
                />

                <button
                  type="button"
                  className="link-btn"
                  style={{
                    fontStyle: "italic",
                    color: "var(--textSecondary)",
                    fontSize: "0.96em",
                    textDecoration: "none",
                  }}
                  onClick={next}
                >
                  Question suivante
                </button>
              </>
            )}

            {cardGeminiResult && !targetIsHebrew && (
              <>
                <p>
                  <strong>Note du professeur : {cardGeminiResult.score} / 5</strong>
                </p>
                <p className="muted">Ta traduction : {cardGeminiResult.translation}</p>
                <ul className="words-list">
                  {cardGeminiResult.observations.map((obs, i) => (
                    <li key={i}>{obs}</li>
                  ))}
                </ul>

                <hr
                  style={{ width: "100%", border: "none", borderTop: "1px solid var(--cardBorder)", margin: "12px 0" }}
                />

                <button
                  type="button"
                  className="link-btn"
                  style={{
                    fontStyle: "italic",
                    color: "var(--textSecondary)",
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
      </div>
    );
  }

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
          explicite du user. Plein écran + PageTurnCurl (position:absolute,
          pas flex:1 normal) pour porter l'animation "tourner la page" au
          changement de phrase, cf. demande explicite du user. */}
      {mode === "exploration" && (
        <div style={{ position: "relative", flex: 1, width: "100%", perspective: 1600, overflow: "hidden" }}>
          {renderExplorationPhrase(phrase, isCursive)}
          {flip && (
            <PageTurnCurl
              dir={flip.dir}
              phase={flip.phase}
              renderPage={() => renderExplorationPhrase(flip.snapshot.phrase, flip.snapshot.isCursive)}
            />
          )}
        </div>
      )}

      {/* Même technique que le bloc exploration ci-dessus (plein écran +
          PageTurnCurl) — leçon ET révisions, cf. demande explicite du user
          ("tous les objets présents dans révisions qui sont itérables"),
          cf. renderRevisionCard. */}
      {mode === "revision" && (
        <div style={{ position: "relative", flex: 1, width: "100%", perspective: 1600, overflow: "hidden" }}>
          {renderRevisionCard({ phrase, isCursive, evalMode, revealed, studentSolution, geminiResult, geminiError, pulse })}
          {flip && (
            <PageTurnCurl dir={flip.dir} phase={flip.phase} renderPage={() => renderRevisionCard(flip.snapshot)} />
          )}
        </div>
      )}

        </>
      )}
    </section>
  );
}
