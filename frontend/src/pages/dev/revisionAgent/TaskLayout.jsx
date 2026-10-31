// Gabarit d'une séance (cf. demande explicite du user), à droite des
// réglages : au centre, de haut en bas, la conversation informelle (dernière
// prise de parole du prof : salutations, transitions…), l'exercice (consigne,
// question ou énoncé), la réponse de l'élève et son évaluation ; à droite, la
// matière pédagogique (le texte de la leçon…), qui reste visible pendant
// qu'on fait défiler.
// La conversation est toujours là ; la matière (s'il y en a une :
// materialLabel) apparaît comme les autres zones, en se déroulant, dès
// qu'elle a un contenu ; l'exercice, la réponse et
// l'évaluation n'apparaissent qu'au moment de servir, en se déroulant vers le
// bas comme un volet qu'on tire (un nouvel exercice — exerciseKey — se
// déroule à nouveau).
// extra : d'autres fenêtres, sous l'évaluation ({key, label, className,
// content, delayed}), ou sous l'exercice si early (un indice…). balanced : les
// deux colonnes ont la même largeur. exercisePersistent : la fenêtre de
// l'exercice ne se referme jamais (closing ne ferme que les autres). followup :
// une fenêtre à droite, sous la matière (followupLabel) ; avec composer, au
// centre, sous la réponse de l'élève.
// materialOpen : la matière à la demande (cf. ExpressionBoard, l'ampoule de
// l'antisèche). Sur mobile (cf. .ra-main-fold), elle prend la place des
// fenêtres du centre, qu'elle pousse vers le haut ; elle défile avec la page,
// et un glissement du doigt vers le bas, une fois en haut de la page
// (onMaterialClose), la referme et les fait redescendre. Avec composer, sur
// mobile, les fenêtres du centre tiennent dans la hauteur de l'écran (cf.
// .ra-main-fold-screen) : la conversation prend la place qui reste. wideMain : les
// largeurs des deux colonnes permutées, le centre le plus large (cf.
// CompletionBoard). compactSide : la
// colonne de droite prend juste la largeur des boutons du bas, accolée au
// centre. answerBlind : la fenêtre « Réponse » est un store (cf. Blind),
// présent dès que answerBlind est vrai. answerLabel : l'intitulé de la fenêtre de
// la réponse (« Lecture »…). closing : les fenêtres sous la conversation se
// referment, de bas en haut (cf. demande explicite du user). finished : fin de la
// séance — la colonne du centre glisse vers la gauche et disparaît, puis celle
// de droite (matière, suivi) glisse prendre sa place, pour le bilan.
// La facture de la séance (cf. Bill) arrive quand la connexion s'éteint :
// toutes les fenêtres quittent l'écran vers le haut, l'une après l'autre (cf.
// .ra-layout-leaving), puis la facture, seule, se déroule comme un volet
// qu'on tire, et ses lignes s'écrivent (cf. demande explicite du user).

import { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import Bill from "./Bill";
import { BillCloseContext, BillContext } from "./billContext";

// Décalage entre la fermeture de deux fenêtres voisines (cf. .ra-volet-closing).
const CLOSE_STEP_SECONDS = 0.15;
// Fin de la séance : départ de la colonne du centre (cf. .ra-layout-finishing),
// délai compris.
const FINISH_MS = 2100;
// Départ des fenêtres vers le haut quand la connexion s'éteint (cf. .ra-layout-leaving), décalages compris.
const LEAVE_MS = 1000;
const MOBILE = "(max-width: 899px)";
// Glissement du doigt vers le bas qui referme l'antisèche, sur mobile.
const SWIPE_PX = 60;
// Marge sous les fenêtres du centre, sur mobile (cf. .app-content), sans faire défiler la page.
const BOTTOM_PX = 30;

// Sur mobile, les fenêtres du centre tiennent dans la hauteur de l'écran sous leur bord haut (--ra-screen-height,
// cf. .ra-main-fold-screen), remesurée quand la fenêtre change de taille ou que les réglages s'en vont.
function useScreenHeight(ref, active) {
  useLayoutEffect(() => {
    const fold = ref.current;
    if (!active || !fold) return undefined;
    const measure = () => {
      const top = fold.getBoundingClientRect().top + window.scrollY;
      fold.style.setProperty("--ra-screen-height", `${Math.max(320, window.innerHeight - top - BOTTOM_PX)}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [ref, active]);
}

function Zone({ className, label, aside, empty, children }) {
  return (
    <section className={`card ra-zone ${className}`} aria-label={label}>
      <div className="ra-panel-head">
        <span className="ra-label">{label}</span>
        {aside}
      </div>
      {children ?? <p className="muted ra-zone-empty">{empty}</p>}
    </section>
  );
}

// Fenêtre « Réponse » en store (cf. demande explicite du user) : son intitulé
// reste en place ; dessous, le contenu se déroule vers le bas quand il y a une
// réponse et se remonte quand elle s'en va ; la bande bleue à poignées, au bas
// du store, reste toujours visible. La réponse reste là le temps que le store
// se remonte (elle ne s'en va qu'à la fin de la fermeture, cf. closing).
function Blind({ open, children }) {
  return (
    <div className={`ra-blind ${open ? "ra-blind-open" : ""}`}>
      <div className="ra-blind-content">
        <div>{children}</div>
      </div>
      <div className="ra-blind-band" aria-hidden="true" />
    </div>
  );
}

// Zone qui n'existe que si elle a un contenu, déroulée à son apparition ;
// delayed : attend que la zone du dessus ait fini de se dérouler.
function Volet({ delayed, className = "", style, children }) {
  return (
    <div className={`ra-volet ${delayed ? "ra-volet-delayed" : ""} ${className}`} style={style}>
      <div className="ra-volet-inner">{children}</div>
    </div>
  );
}

export default function TaskLayout({
  conversation,
  exercise,
  exerciseKey,
  exerciseLabel = "Exercice",
  answer,
  answerLabel = "Réponse",
  evaluation,
  extra = [],
  actions,
  closing = false,
  clock,
  material,
  materialLabel,
  materialAside,
  balanced = false,
  exercisePersistent = false,
  followup,
  followupLabel,
  compactSide = false,
  wideMain = false,
  answerBlind,
  finished = false,
  composer,
  materialOpen,
  onMaterialClose,
}) {
  const bill = useContext(BillContext);
  const closeBill = useContext(BillCloseContext);
  const foldRef = useRef(null);
  useScreenHeight(foldRef, Boolean(composer));
  // Antisèche ouverte, sur mobile : un glissement vers le bas quand la page est déjà en haut la referme (cf. demande
  // explicite du user) ; plus bas, le doigt fait simplement remonter l'antisèche.
  const swipe = useRef(null);
  const onSheetTouchStart = (e) => {
    const touch = e.touches[0];
    swipe.current = { x: touch.clientX, y: touch.clientY, atTop: window.scrollY <= 4 };
  };
  const onSheetTouchEnd = (e) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start?.atTop || !materialOpen || !onMaterialClose || !window.matchMedia(MOBILE).matches) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (dy < SWIPE_PX || Math.abs(dy) < 2 * Math.abs(dx)) return;
    onMaterialClose();
  };
  // Les fenêtres ont quitté l'écran : la facture s'affiche seule.
  const [billShown, setBillShown] = useState(false);
  useEffect(() => {
    if (!bill) return undefined;
    const timer = setTimeout(() => setBillShown(true), LEAVE_MS);
    return () => {
      clearTimeout(timer);
      setBillShown(false);
    };
  }, [bill]);
  // La colonne du centre a fini de glisser hors de l'écran.
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!finished) return undefined;
    const timer = setTimeout(() => setGone(true), FINISH_MS);
    return () => {
      clearTimeout(timer);
      setGone(false);
    };
  }, [finished]);

  const volets = [
    exercise && {
      key: exerciseKey,
      label: exerciseLabel,
      className: "ra-zone-exercise",
      content: exercise,
      persistent: exercisePersistent,
    },
    ...extra.filter((volet) => volet.early),
    answerBlind === undefined
      ? answer && { key: `answer-${exerciseKey}`, label: answerLabel, className: "ra-zone-answer", content: answer }
      : (answerBlind || answer) && {
          key: "answer-blind",
          label: answerLabel,
          className: "ra-zone-answer",
          content: <Blind open={Boolean(answer) && !closing}>{answer}</Blind>,
          persistent: true,
        },
    evaluation && {
      key: `evaluation-${exerciseKey}`,
      label: "Évaluation",
      className: "ra-zone-evaluation",
      content: evaluation,
      delayed: Boolean(answer),
    },
    ...extra.filter((volet) => !volet.early),
    // Boutons qui suivent l'évaluation (question suivante…), sous elle.
    actions && { key: `actions-${exerciseKey}`, content: actions, delayed: Boolean(answer), bare: true },
  ].filter(Boolean);

  // Colonne de droite : la matière et / ou le suivi (la tâche « Question » n'a que le suivi).
  const side = Boolean(materialLabel || followup);
  const billZone = bill && (
    <Volet>
      <Zone
        className="ra-zone-bill"
        label="Facture"
        aside={
          closeBill && (
            <button
              type="button"
              className="ra-bill-close"
              onClick={closeBill}
              aria-label="Fermer la facture"
              title="Fermer"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )
        }
      >
        <Bill bill={bill} />
      </Zone>
    </Volet>
  );

  if (billShown) {
    return <div className="ra-layout ra-layout-single ra-layout-billing">{billZone}</div>;
  }

  return (
    <div
      className={`ra-layout ${side ? "" : "ra-layout-single"} ${balanced ? "ra-layout-balanced" : ""} ${
        compactSide ? "ra-layout-compact-side" : ""
      } ${wideMain ? "ra-layout-wide-main" : ""} ${
        gone ? "ra-layout-finished" : finished ? "ra-layout-finishing" : ""
      } ${bill ? "ra-layout-leaving" : ""}`}
    >
      {!gone && (
        // La colonne du centre se replie vers le haut quand l'antisèche s'ouvre, sur mobile seulement (sans effet
        // sur ordinateur : display: contents).
        <div
          ref={foldRef}
          className={`ra-main-fold ${composer ? "ra-main-fold-screen" : ""} ${
            composer && materialOpen ? "ra-main-fold-closed" : ""
          }`}
        >
        <div className="ra-layout-main">
          <Zone className="ra-zone-conversation" label="Conversation" empty="Le prof va prendre la parole…">
            {conversation}
          </Zone>
          {volets.map((volet, i) => (
            <Volet
              key={volet.key}
              delayed={volet.delayed}
              className={closing && !volet.persistent ? "ra-volet-closing" : ""}
              // La plus basse se ferme d'abord.
              style={
                closing && !volet.persistent
                  ? { "--close-delay": `${(volets.length - 1 - i) * CLOSE_STEP_SECONDS}s` }
                  : undefined
              }
            >
              {volet.bare ? (
                volet.content
              ) : (
                <Zone className={volet.className} label={volet.label}>
                  {volet.content}
                </Zone>
              )}
            </Volet>
          ))}
          {/* Page sans Gemini Live : la réponse de l'élève, sous les fenêtres de l'exercice ; son intitulé change
              avec ce que le prof en fait (cf. StudentAnswer). */}
          {composer && (
            <section className="card ra-zone ra-zone-composer" aria-label="Ta réponse">
              {composer}
            </section>
          )}
          {/* Avec la réponse de l'élève, le suivi vient dessous, de la même largeur (cf. demande explicite du user). */}
          {composer && followup && (
            <Volet>
              <Zone className="ra-zone-followup" label={followupLabel}>
                {followup}
              </Zone>
            </Volet>
          )}
          {/* Chrono de la séance, en bas à droite : sous le texte s'il y en a un ; avec la réponse de l'élève, sous
              le suivi. */}
          {(!side || composer) && clock && <div className="ra-layout-clock">{clock}</div>}
        </div>
        </div>
      )}
      {side && (
        <div className="ra-layout-side">
          {material && materialOpen === undefined && (
            <Volet className="ra-volet-material">
              <Zone
                className="ra-zone-material"
                label={materialLabel}
                aside={materialAside}
              >
                {material}
              </Zone>
            </Volet>
          )}
          {/* materialOpen : la matière ne s'affiche qu'à la demande, déroulée vers le bas comme un volet qu'on tire
              (cf. ExpressionBoard, l'ampoule de l'antisèche). */}
          {material && materialOpen !== undefined && (
            <div
              className={`ra-fold ra-sheet-fold ${materialOpen ? "" : "ra-fold-closed"}`}
              onTouchStart={onSheetTouchStart}
              onTouchEnd={onSheetTouchEnd}
            >
              <div className="ra-fold-inner">
                <Zone className="ra-zone-material" label={materialLabel} aside={materialAside}>
                  {material}
                </Zone>
              </div>
            </div>
          )}
          {followup && !composer && (
            <Volet>
              <Zone className="ra-zone-followup" label={followupLabel}>
                {followup}
              </Zone>
            </Volet>
          )}
          {clock && !composer && <div className="ra-layout-clock">{clock}</div>}
        </div>
      )}
    </div>
  );
}
