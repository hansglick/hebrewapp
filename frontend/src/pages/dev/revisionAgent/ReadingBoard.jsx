import { useEffect, useRef, useState } from "react";
import { Answer, Evaluation } from "./Assessment";
import TaskLayout from "./TaskLayout";
import TeacherSpeech from "./TeacherSpeech";

// Nom du personnage qui prend la parole, en tête d'une réplique de dialogue
// (« דוד: שלום רוני… ») : l'élève ne le lit pas (cf. ComprehensionBoard).
const SPEAKER = /^[^:.?!,]{1,20}:\s*/;
// Effacement de la lecture précédente quand l'élève relit (cf. .ra-assessment-erasing).
const ERASE_MS = 700;
// Espace laissé au-dessus de l'extrait à lire, en haut de la fenêtre du texte.
const EXTRACT_MARGIN_PX = 16;

// Haut-parleur, dans la couleur du liseré du surlignage (cf. .ra-speaker).
function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path
        d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Réplique du texte : le nom du personnage en italique ; dans l'extrait à
// lire, le reste surligné au stabilo, de droite à gauche, une réplique après
// l'autre (stroke : son rang, cf. .ra-reading-extract). Au bout de la
// dernière, à gauche de son dernier mot, le haut-parleur : l'élève demande au
// prof de lui lire l'extrait (cf. demande explicite du user).
function Phrase({ phrase, stroke, onListen }) {
  const speaker = phrase.match(SPEAKER)?.[0] ?? "";
  const rest = phrase.slice(speaker.length);
  return (
    <>
      {speaker && <span className="ra-text-speaker">{speaker}</span>}
      {stroke === undefined ? (
        rest
      ) : (
        <mark className="ra-reading-extract" style={{ "--stroke": stroke }}>
          {rest}
        </mark>
      )}
      {onListen && (
        <button
          type="button"
          className="ra-speaker"
          style={{ "--stroke": stroke }}
          onClick={onListen}
          aria-label="Écouter le prof lire ces phrases"
          title="Écouter le prof lire ces phrases"
        >
          <SpeakerIcon />
        </button>
      )}
    </>
  );
}

// Tâche « Lecture », dans le gabarit commun (cf. TaskLayout), comme la
// compréhension (cf. demande explicite du user) : au centre, la conversation
// avec le prof, puis une fenêtre « Lecture » — ce que l'élève a lu (la
// transcription de Gemini Live), les mots fautifs surlignés, puis, sous un
// trait, le commentaire de chaque erreur ; quand l'élève relit, la lecture
// précédente s'efface d'abord, comme au tableau. À droite, tout le texte, dès
// que l'élève est prêt, l'extrait à lire surligné ; « Lecture suivante »
// accolée à « Arrêter la séance ». Pas de suivi, pas de traduction. Le
// nombre de phrases par lecture se règle dans les paramètres (cf.
// RevisionAgentScreen). L'extrait à lire remonte en haut
// du texte, à hauteur de la conversation (cf. demande explicite du user). Contrôle (cf. demande explicite du user) : si la case
// « Phonétique » des paramètres est cochée (showPhonetic), une fenêtre montre,
// pour chaque lecture, réussie ou non, la transcription hébraïque, la
// transcription phonétique du prof et la prononciation attendue.
export default function ReadingBoard({
  teacher,
  text,
  extract,
  control,
  evaluation,
  closing,
  done,
  notice,
  languageSwitch,
  showPhonetic,
  onNext,
  onListen,
  clock,
}) {
  const phraseRefs = useRef([]);

  // L'élève relit : sa lecture précédente s'efface d'abord, puis la nouvelle
  // s'écrit (cf. QuestionBoard). Ce rendu-ci se sert déjà des nouvelles valeurs
  // (l'état ne change qu'au rendu suivant).
  const [stored, setCurrent] = useState({ evaluation: null, seq: 0 });
  const [storedErasing, setErasing] = useState(null);
  let current = stored;
  let erasing = storedErasing;
  if (evaluation !== stored.evaluation) {
    if (stored.evaluation && evaluation && !closing) {
      erasing = stored;
      setErasing(stored);
    }
    current = { evaluation, seq: stored.seq + 1 };
    setCurrent(current);
  }
  useEffect(() => {
    if (!storedErasing) return undefined;
    const timer = setTimeout(() => setErasing(null), ERASE_MS);
    return () => clearTimeout(timer);
  }, [storedErasing]);

  // L'extrait à lire remonte en haut du texte, à hauteur des yeux, comme la
  // conversation au centre (le texte défile dans sa fenêtre).
  useEffect(() => {
    const phrase = extract && phraseRefs.current[extract.phrases[0]];
    const box = phrase?.closest(".ra-zone-material");
    if (!box) return;
    const top = box.scrollTop + phrase.getBoundingClientRect().top - box.getBoundingClientRect().top;
    box.scrollTo({ top: top - EXTRACT_MARGIN_PX, behavior: "smooth" });
  }, [extract]);

  if (!teacher && !text && !notice && !clock) return null;

  const speech = (notice || teacher) && (
    <>
      {notice && <p className="ra-alert">{notice}</p>}
      {teacher && <TeacherSpeech key={teacher.id} line={teacher} mode={languageSwitch} />}
    </>
  );

  // Le mode de langue du prof, déjà là avant qu'il parle (cf. ComprehensionBoard).
  const conversation =
    languageSwitch && !teacher ? (
      <div className="ra-conversation-row">
        {languageSwitch}
        <div className="ra-conversation-main">
          {speech || <p className="muted">Le prof va prendre la parole…</p>}
        </div>
      </div>
    ) : (
      speech
    );

  // Une seule fenêtre : la lecture, un trait, puis le commentaire de chaque
  // erreur surlignée ; réussie, seulement la lecture.
  const assessed = erasing ?? (evaluation ? current : null);
  const assessment = assessed && (
    <div key={assessed.seq} className={`ra-assessment ${erasing ? "ra-assessment-erasing" : ""}`}>
      <Answer evaluation={assessed.evaluation} legend={false} />
      {assessed.evaluation.errors.length > 0 && (
        <>
          <hr className="ra-assessment-rule" />
          <Evaluation evaluation={assessed.evaluation} />
        </>
      )}
    </div>
  );

  // La lecture de l'extrait en cours seulement : elle s'en va avec lui.
  const controlled = showPhonetic && control && extract && control.number === extract.number;
  const phonetic = controlled && (
    <dl className="ra-phonetic">
      <dt>Hébreu</dt>
      <dd dir="rtl" lang="he">
        {control.heard || "—"}
      </dd>
      <dt>Lecture</dt>
      <dd dir="rtl" lang="he">
        {control.reading || "—"}
      </dd>
      <dt>Entendu</dt>
      <dd>{control.heard_phonetic || "(pas de transcription phonétique)"}</dd>
      <dt>Attendu</dt>
      <dd>{control.expected_phonetic || "—"}</dd>
    </dl>
  );

  const canGoOn = !done && !closing && Boolean(extract);
  const controls = clock && (
    <>
      <button type="button" className="ra-next ra-next-side" onClick={onNext} disabled={!canGoOn}>
        Lecture suivante
      </button>
      {clock}
    </>
  );

  const material = text && (
    <>
      {text.title && (
        <h3 className="ra-text-title" dir="rtl" lang="he">
          {text.title}
        </h3>
      )}
      <div className="ra-text" dir="rtl" lang="he">
        {text.phrases.map((phrase, i) => {
          const rank = extract ? extract.phrases.indexOf(i) : -1;
          const last = rank >= 0 && rank === extract.phrases.length - 1;
          return (
            <p key={rank >= 0 ? `${i}-${extract.number}` : i} ref={(el) => (phraseRefs.current[i] = el)}>
              <Phrase
                phrase={phrase}
                stroke={rank >= 0 ? rank : undefined}
                onListen={last && !closing && !done ? onListen : undefined}
              />
            </p>
          );
        })}
      </div>
    </>
  );

  return (
    <TaskLayout
      conversation={conversation || null}
      exerciseKey="board"
      answer={assessment || null}
      answerLabel="Lecture"
      extra={
        phonetic
          ? [{ key: `phonetic-${control.number}`, label: "Phonétique (contrôle)", className: "ra-zone-phonetic", content: phonetic }]
          : []
      }
      closing={closing}
      clock={controls || null}
      material={material || null}
      materialLabel="Texte"
    />
  );
}
