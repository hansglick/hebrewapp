// Gabarit d'une séance (cf. demande explicite du user), à droite des
// réglages : au centre, de haut en bas, la conversation informelle (dernière
// prise de parole du prof : salutations, transitions…), l'exercice (consigne,
// question ou énoncé), la réponse de l'élève et son évaluation ; à droite, la
// matière pédagogique (le texte de la leçon…), qui reste visible pendant
// qu'on fait défiler.
// La conversation et la matière sont toujours là ; l'exercice, la réponse et
// l'évaluation n'apparaissent qu'au moment de servir, en se déroulant vers le
// bas comme un volet qu'on tire (un nouvel exercice — exerciseKey — se
// déroule à nouveau).
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

// Zone qui n'existe que si elle a un contenu, déroulée à son apparition ;
// delayed : attend que la zone du dessus ait fini de se dérouler.
function Volet({ delayed, children }) {
  return (
    <div className={`ra-volet ${delayed ? "ra-volet-delayed" : ""}`}>
      <div className="ra-volet-inner">{children}</div>
    </div>
  );
}

export default function TaskLayout({
  conversation,
  exercise,
  exerciseKey,
  answer,
  evaluation,
  material,
  materialLabel,
  materialAside,
}) {
  return (
    <div className="ra-layout">
      <div className="ra-layout-main">
        <Zone className="ra-zone-conversation" label="Conversation" empty="Le prof va prendre la parole…">
          {conversation}
        </Zone>
        {exercise && (
          <Volet key={exerciseKey}>
            <Zone className="ra-zone-exercise" label="Exercice">
              {exercise}
            </Zone>
          </Volet>
        )}
        {answer && (
          <Volet key={`answer-${exerciseKey}`}>
            <Zone className="ra-zone-answer" label="Réponse">
              {answer}
            </Zone>
          </Volet>
        )}
        {evaluation && (
          <Volet key={`evaluation-${exerciseKey}`} delayed={Boolean(answer)}>
            <Zone className="ra-zone-evaluation" label="Évaluation">
              {evaluation}
            </Zone>
          </Volet>
        )}
      </div>
      <Zone
        className="ra-zone-material"
        label={materialLabel ?? "Matière"}
        aside={materialAside}
        empty="Le texte s'affichera ici."
      >
        {material}
      </Zone>
    </div>
  );
}
