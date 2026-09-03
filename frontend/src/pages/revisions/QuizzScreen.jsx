import { useEffect, useState } from "react";
import { getRandomQuizz } from "../../api/content";
import { getNiveau, createEvaluation } from "../../api/user";
import { useSwipe } from "../../hooks/useSwipe";
import { useRandomBrowser } from "../../hooks/useRandomBrowser";
import { ActionHints } from "../../components/ActionHints";
import { BottomNavBar } from "../../components/BottomNavBar";
import { QuizzBubbles } from "../../components/QuizzBubbles";
import "../screens.css";

export default function QuizzScreen() {
  const [niveau, setNiveau] = useState(null);
  const [selected, setSelected] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    getNiveau().then(setNiveau);
  }, []);

  const lessonCode = niveau?.reference_lesson;

  const { current: quizz, next, back } = useRandomBrowser(
    () => (lessonCode ? getRandomQuizz(lessonCode) : Promise.resolve(null)),
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
    const id = setTimeout(() => next(), 2000);
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

  // Sur le tout premier quizz de la session (pas encore d'historique),
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
  });

  if (!quizz) return null;

  return (
    <>
    <section className="screen" style={{ paddingBottom: "calc(var(--bottom-nav-height) * 2)", flex: 1 }} onPointerDown={swipeHandlers.onPointerDown}>
      <ActionHints {...swipeHandlers.hints} />

      {/* zoom: 1.6 (+100% de base, réduit de 20% cf. demande explicite du
          user) — flex:1 + justifyContent:center centre le bloc dans
          l'espace disponible (même technique que VerbeScreen/
          OralAnswerCapture). */}
      <div
        style={{
          zoom: 1.6,
          flex: 1,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <p style={{ color: "var(--text)", margin: 0, fontSize: "0.96em" }}>{quizz.french}</p>

        {/* width fixée en CSS (cf. .quizz-hr, screens.css) et non ici : un
            style inline gagnerait toujours face à la règle @media,
            empêchant l'override mobile de jamais s'appliquer. */}
        <hr
          className="quizz-hr"
          style={{
            border: "none",
            borderTop: "1px solid var(--border)",
            margin: 0,
          }}
        />

        <QuizzBubbles
          options={quizz.options}
          correctKey={quizz.key}
          selectedKey={selected}
          onSelect={submitted ? undefined : setSelected}
          disabled={submitted}
        />

        {selected && !submitted && (
          <button
            type="button"
            className="link-btn"
            style={{
              marginTop: 0,
              fontStyle: "italic",
              color: "var(--textMuted)",
              fontSize: "0.75em",
              textDecoration: "none",
            }}
            onClick={handleSubmit}
          >
            Valider ma réponse
          </button>
        )}

        {submitted && (
          <p style={{ fontWeight: 600, color: selected === quizz.key ? "var(--success)" : "var(--danger)" }}>
            {selected === quizz.key ? "Correct" : "Incorrect"}
          </p>
        )}
      </div>
    </section>
    <BottomNavBar onPrevious={goPrevious} onNext={goNext} />
    </>
  );
}
