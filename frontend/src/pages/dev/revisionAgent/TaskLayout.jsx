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
// une fenêtre à droite, sous la matière (followupLabel). wideMain : les
// largeurs des deux colonnes permutées, le centre le plus large (cf.
// CompletionBoard). compactSide : la
// colonne de droite prend juste la largeur des boutons du bas, accolée au
// centre. answerBlind : la fenêtre « Réponse » est un store (cf. Blind),
// présent dès que answerBlind est vrai. answerLabel : l'intitulé de la fenêtre de
// la réponse (« Lecture »…). closing : les fenêtres sous la conversation se
// referment, de bas en haut (cf. demande explicite du user). finished : fin de la
// séance — la colonne du centre glisse vers la gauche et disparaît, puis celle
// de droite (matière, suivi) glisse prendre sa place, pour le bilan.

import { useEffect, useState } from "react";

// Décalage entre la fermeture de deux fenêtres voisines (cf. .ra-volet-closing).
const CLOSE_STEP_SECONDS = 0.15;
// Fin de la séance : départ de la colonne du centre (cf. .ra-layout-finishing),
// délai compris.
const FINISH_MS = 2100;

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
}) {
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

  return (
    <div
      className={`ra-layout ${side ? "" : "ra-layout-single"} ${balanced ? "ra-layout-balanced" : ""} ${
        compactSide ? "ra-layout-compact-side" : ""
      } ${wideMain ? "ra-layout-wide-main" : ""} ${
        gone ? "ra-layout-finished" : finished ? "ra-layout-finishing" : ""
      }`}
    >
      {!gone && (
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
          {/* Chrono de la séance, en bas à droite : sous le texte s'il y en a un. */}
          {!side && clock && <div className="ra-layout-clock">{clock}</div>}
        </div>
      )}
      {side && (
        <div className="ra-layout-side">
          {material && (
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
          {followup && (
            <Volet>
              <Zone className="ra-zone-followup" label={followupLabel}>
                {followup}
              </Zone>
            </Volet>
          )}
          {clock && <div className="ra-layout-clock">{clock}</div>}
        </div>
      )}
    </div>
  );
}
