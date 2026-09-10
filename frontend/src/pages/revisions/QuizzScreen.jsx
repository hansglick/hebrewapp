import { useEffect, useRef, useState } from "react";
import { getRandomQuizz } from "../../api/content";
import { getNiveau, createEvaluation } from "../../api/user";
import { useSwipe } from "../../hooks/useSwipe";
import { useRandomBrowser } from "../../hooks/useRandomBrowser";
import { ActionHints } from "../../components/ActionHints";
import { BottomNavBar } from "../../components/BottomNavBar";
import { QuizzBubbles } from "../../components/QuizzBubbles";
import { PageTurnCurl, PAGE_TURN_TOTAL_DURATION_MS } from "../../components/PageTurnCurl";
import { SectionTitle } from "../../components/QuoteBlock";
import { PerfStat } from "../../components/PerfStat";
import "../screens.css";

// Même pastille numérotée que les titres de l'écran révision/mot (cf.
// MotScreen.jsx::StepBadge, même taille/police) — cf. demande explicite
// du user ("en s'inspirant de ce qui a été fait dans révisions/mot").
const STEP_BADGE_SIZE = 25;
function StepBadge({ number, background, color }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: STEP_BADGE_SIZE,
        height: STEP_BADGE_SIZE,
        borderRadius: "50%",
        background,
        color,
        fontSize: "0.9375em",
        fontWeight: 700,
        // marginRight:6 (au lieu de 12) : réduit de 50% l'espace vers le
        // titre, en déplaçant le titre à gauche (pas la pastille) — cf.
        // demande explicite du user.
        marginRight: 6,
        flexShrink: 0,
        // position:relative + left (pas de marginLeft) : décale
        // uniquement le rond visuellement, sans repousser le titre à côté
        // — la moitié de la largeur du rond (12.5px), pour que son CENTRE
        // (pas son bord) tombe sur l'extrémité gauche du trait, cf.
        // demande explicite du user.
        position: "relative",
        left: -STEP_BADGE_SIZE / 2,
      }}
    >
      {number}
    </span>
  );
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function QuizzScreen() {
  const [niveau, setNiveau] = useState(null);
  const [selected, setSelected] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [flip, setFlip] = useState(null); // { dir, quizz, selected, submitted, phase: "start" | "animating" }
  const flipTimeoutRef = useRef(null);
  // Force PerfBubble à recalculer son % juste après chaque évaluation
  // envoyée (nouvelle valeur = nouveau fetch, cf. PerfBubble::refreshKey) —
  // cf. demande explicite du user ("en direct").
  const [perfVersion, setPerfVersion] = useState(0);

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
    }).then(() => setPerfVersion((v) => v + 1));
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
          // 1.6 * 0.75 : réduit de 25% tout le contenu du fond principal
          // (hors barres de contrôle, rendues hors de page-turn-card) —
          // cf. demande explicite du user.
          zoom: 1.6 * 0.75,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        {/* Pastille "1" + titre "Traduis le mot" — même format que l'écran
            révision/mot (StepBadge/SectionTitle) — cf. demande explicite
            du user. zoom:1/(1.6*0.75) annule le zoom ambiant de ce
            conteneur pour rendre à la même taille absolue que l'écran
            révision/mot (aucun zoom là-bas), cf. demande explicite du
            user ("même taille que révision/mots"). */}
        <div className="quizz-title-row" style={{ display: "flow-root", zoom: 1 / (1.6 * 0.75) }}>
          <SectionTitle fontSize="0.84em" color="#9ca3af" fontWeight={400}>
            <StepBadge number={1} background="#dbeafe" color="#1d4ed8" />
            Traduis le mot
          </SectionTitle>
        </div>

        {/* Même gris clair que MotScreen/VerbeScreen (révision) — cf.
            demande explicite du user. */}
        <p style={{ color: "var(--textPrimary)", margin: 0, fontSize: "0.96em" }}>{capitalize(cardQuizz.french)}</p>

        {/* width fixée en CSS (cf. .quizz-hr, screens.css) et non ici : un
            style inline gagnerait toujours face à la règle @media,
            empêchant l'override mobile de jamais s'appliquer. */}
        <div className="quizz-hr">
          <hr
            style={{
              width: "100%",
              border: "none",
              borderTop: "1px solid var(--cardBorder)",
              margin: 0,
            }}
          />
        </div>

        {/* Pastille "2" (vert pastel) + titre "Double-tap pour
            sélectionner la réponse" — cf. demande explicite du user.
            marginTop:0 : la pastille PERF. ne se trouve plus juste sous le
            trait, plus besoin de remonter ce bloc pour égaler l'écart
            phrase française->trait (19.19px), cf. demande explicite du
            user ("même espace... entre le titre du bloc 2 et la barre
            horizontale au-dessus"). */}
        <div className="quizz-title-row" style={{ display: "flow-root", zoom: 1 / (1.6 * 0.75), marginTop: 0 }}>
          <SectionTitle fontSize="0.84em" color="#9ca3af" fontWeight={400}>
            <StepBadge number={2} background="var(--validationGrisee)" color="var(--validationPleine)" />
            Double-tap pour choisir la réponse
          </SectionTitle>
        </div>

        {/* marginTop:4.8 calé (mesuré via Claude in Chrome) pour
            augmenter de 30% l'écart avec la pastille "2" au-dessus
            (19.19px -> 24.95px) — cf. demande explicite du user. Wrapper
            dédié plutôt qu'une prop sur QuizzBubbles : ce composant est
            réutilisé ailleurs (examens), un style ici ne doit pas les
            affecter. */}
        <div style={{ marginTop: 4.8 }}>
          <QuizzBubbles
            options={cardQuizz.options}
            correctKey={cardQuizz.key}
            selectedKey={cardSelected}
            onSelect={cardSubmitted ? undefined : setSelected}
            onConfirm={cardSubmitted ? undefined : handleSubmit}
            disabled={cardSubmitted}
          />
        </div>

        {/* Double-tap (au lieu d'un bouton "Valider" séparé) : re-taper la
            bulle déjà sélectionnée valide directement. Le rappel séparé
            ("Appuyez de nouveau...") a été retiré : le titre du bloc 2
            ("Double-tap pour choisir la réponse") l'explique déjà — cf.
            demande explicite du user. Toujours monté (visibility, pas un
            rendu conditionnel) : sa hauteur reste réservée même avant
            validation, sinon son apparition agrandit le contenu total et
            "safe center" recentre tout, faisant sauter la position de
            tous les éléments au-dessus — cf. bug rapporté par le user. */}
        <p
          style={{
            margin: 0,
            fontWeight: 600,
            visibility: cardSubmitted ? "visible" : "hidden",
            color: cardSelected === cardQuizz.key ? "var(--validationPleine)" : "var(--annulationPleine)",
          }}
        >
          {cardSelected === cardQuizz.key ? "Correct" : "Incorrect"}
        </p>

        {/* Alignée sous les bulles / le retour Correct-Incorrect, justifiée
            à droite pour que la fin de la chaîne coïncide avec l'extrémité
            droite du trait — cf. demande explicite du user. className
            "quizz-hr" : même largeur (et même override mobile) que le
            trait, sans dupliquer ces valeurs. zoom:1/(1.6*0.75) annule le
            zoom ambiant de ce bloc. */}
        <div className="quizz-hr" style={{ zoom: 1 / (1.6 * 0.75), marginTop: -6 }}>
          <PerfStat objectType="quizz" refreshKey={perfVersion} />
        </div>
      </div>
    );
  }

  return (
    <>
    {/* paddingBottom réduit de *2 à *1 (juste assez pour dégager la
        barre de contrôle inférieure, pas le double) : l'excédent
        rétrécissait la boîte dans laquelle page-turn-card centre son
        contenu, poussant les éléments visuellement trop haut par rapport
        à la vraie hauteur d'écran disponible — cf. demande explicite du
        user. */}
    <section className="screen" style={{ paddingBottom: "var(--bottom-nav-height)", flex: 1 }} onPointerDown={swipeHandlers.onPointerDown}>
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
