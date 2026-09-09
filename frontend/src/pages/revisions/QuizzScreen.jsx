import { useEffect, useRef, useState } from "react";
import { getRandomQuizz } from "../../api/content";
import { getNiveau, createEvaluation } from "../../api/user";
import { useSwipe } from "../../hooks/useSwipe";
import { useRandomBrowser } from "../../hooks/useRandomBrowser";
import { ActionHints } from "../../components/ActionHints";
import { BottomNavBar } from "../../components/BottomNavBar";
import { QuizzBubbles } from "../../components/QuizzBubbles";
import { PageTurnCurl, PAGE_TURN_TOTAL_DURATION_MS } from "../../components/PageTurnCurl";
import "../screens.css";

export default function QuizzScreen() {
  const [niveau, setNiveau] = useState(null);
  const [selected, setSelected] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [flip, setFlip] = useState(null); // { dir, quizz, selected, submitted, phase: "start" | "animating" }
  const flipTimeoutRef = useRef(null);

  useEffect(() => {
    getNiveau().then(setNiveau);
  }, []);

  const lessonCode = niveau?.reference_lesson;

  const { current: quizz, next, back } = useRandomBrowser(
    (_prevQuizz, seen) => (lessonCode ? getRandomQuizz(lessonCode, seen) : Promise.resolve(null)),
    [lessonCode]
  );

  useEffect(() => {
    setSelected(null);
    setSubmitted(false);
  }, [quizz]);

  function handleSubmit() {
    if (!selected || submitted) return;
    setSubmitted(true);
    createEvaluation({
      objectType: "quizz",
      objectKey: quizz.key,
      success: selected === quizz.key,
    });
  }

  useEffect(() => {
    if (!submitted) return undefined;
    const id = setTimeout(() => {
      startFlip("next");
      next();
    }, 2000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted]);

  useEffect(() => {
    if (!quizz || submitted) return;
    function handleKeyDown(e) {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Enter") handleSubmit();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizz, selected, submitted]);

  // Animation "tourner la page" (cf. PageTurnCurl, déjà appliquée aux
  // mots/verbes/traductions/oral) — cf. demande explicite du user ("tous
  // les objets présents dans révisions qui sont itérables"). Capture tout
  // l'état visuel du quizz ACTUEL (pas seulement le quizz lui-même) comme
  // page "sortante", cf. renderQuizzCard.
  function startFlip(dir) {
    if (flip || !quizz) return;
    setFlip({ dir, quizz, selected, submitted, phase: "start" });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setFlip((f) => (f ? { ...f, phase: "animating" } : f));
      });
    });
    clearTimeout(flipTimeoutRef.current);
    flipTimeoutRef.current = setTimeout(() => setFlip(null), PAGE_TURN_TOTAL_DURATION_MS);
  }

  // Sur le tout premier quizz de la session (pas encore d'historique),
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
  });

  if (!quizz) return null;

  // Rendu d'une carte de quizz (question + bulles de réponse) — utilisé
  // pour la page au repos et, via PageTurnCurl, pour la page "sortante"
  // pendant l'animation, cf. demande explicite du user. zoom:1.6 porté
  // directement sur cette carte (au lieu d'un div séparé à l'intérieur) :
  // page-turn-card remplace maintenant le rôle de conteneur flex:1 que
  // jouait ce div. Les handlers (onSelect/onConfirm) restent branchés sur
  // l'état LIVE du composant, pas sur cardSelected/cardSubmitted — même
  // convention que les autres écrans (MotScreen, VerbeScreen...).
  function renderQuizzCard(cardQuizz, cardSelected, cardSubmitted) {
    return (
      <div
        className="page-turn-card"
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--bg)",
          overflowY: "auto",
          backfaceVisibility: "hidden",
          boxSizing: "border-box",
          zoom: 1.6,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <p style={{ color: "var(--textPrimary)", margin: 0, fontSize: "0.96em" }}>{cardQuizz.french}</p>

        {/* width fixée en CSS (cf. .quizz-hr, screens.css) et non ici : un
            style inline gagnerait toujours face à la règle @media,
            empêchant l'override mobile de jamais s'appliquer. */}
        <hr
          className="quizz-hr"
          style={{
            border: "none",
            borderTop: "1px solid var(--cardBorder)",
            margin: 0,
          }}
        />

        <QuizzBubbles
          options={cardQuizz.options}
          correctKey={cardQuizz.key}
          selectedKey={cardSelected}
          onSelect={cardSubmitted ? undefined : setSelected}
          onConfirm={cardSubmitted ? undefined : handleSubmit}
          disabled={cardSubmitted}
        />

        {/* Double-tap (au lieu d'un bouton "Valider" séparé) : re-taper la
            bulle déjà sélectionnée valide directement, cf. demande
            explicite du user. */}
        {cardSelected && !cardSubmitted && (
          <p
            className="muted"
            style={{ margin: 0, fontStyle: "italic", fontSize: "0.375em" }}
          >
            Appuyez de nouveau sur la réponse pour valider votre choix
          </p>
        )}

        {cardSubmitted && (
          <p style={{ fontWeight: 600, color: cardSelected === cardQuizz.key ? "var(--validationPleine)" : "var(--annulationPleine)" }}>
            {cardSelected === cardQuizz.key ? "Correct" : "Incorrect"}
          </p>
        )}
      </div>
    );
  }

  return (
    <>
    <section className="screen" style={{ paddingBottom: "calc(var(--bottom-nav-height) * 2)", flex: 1 }} onPointerDown={swipeHandlers.onPointerDown}>
      <ActionHints {...swipeHandlers.hints} />

      <div style={{ position: "relative", flex: 1, width: "100%", perspective: 1600, overflow: "hidden" }}>
        {renderQuizzCard(quizz, selected, submitted)}
        {flip && (
          <PageTurnCurl
            dir={flip.dir}
            phase={flip.phase}
            renderPage={() => renderQuizzCard(flip.quizz, flip.selected, flip.submitted)}
          />
        )}
      </div>
    </section>
    <BottomNavBar onPrevious={goPrevious} onNext={goNext} />
    </>
  );
}
