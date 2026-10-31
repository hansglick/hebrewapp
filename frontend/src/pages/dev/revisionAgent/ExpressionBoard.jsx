import { useCallback, useEffect, useRef, useState } from "react";
import { Answer, Evaluation } from "./Assessment";
import DeclensionSentence from "./DeclensionSentence";
import Followup from "./Followup";
import Program from "./Program";
import TaskLayout from "./TaskLayout";
import TeacherSpeech from "./TeacherSpeech";

// Durée de la fermeture des fenêtres de la question (cf. TaskLayout, closing)
// avant que la déclinaison s'ouvre.
const FOLD_MS = 900;

const DECLENSION_INSTRUCTIONS = {
  subject: "Redis ta phrase en changeant le sujet surligné.",
  preposition: "Redis ta phrase en changeant le mot surligné.",
};

const EXERCISE_NAMES = { expression: "Expression libre", declension: "Déclinaison" };

// Antisèche à la demande (page sans Gemini Live, cf. Lamp) : elle reste ouverte
// ce délai après le dernier geste (ouverture, tuile touchée), puis le cours se
// remonte, et l'antisèche elle-même FOLD_UP_MS plus tard (cf. .ra-fold).
const SHEET_MS = 30000;
const FOLD_UP_MS = 450;

// Ampoule de l'antisèche, à gauche de la piste d'enregistrement (cf.
// StudentAnswer) : du bleu des tuiles sur fond blanc ; remontée à chaque
// question (key), elle pulse légèrement une seconde ; toutes les 30 s, des
// rayons en jaillissent (cf. .ra-lamp-rays).
const RAYS = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);

function Lamp({ open, onClick }) {
  return (
    <button
      type="button"
      className={`ra-lamp ${open ? "ra-lamp-open" : ""}`}
      onClick={onClick}
      aria-expanded={open}
      aria-label={open ? "Fermer l’antisèche" : "Ouvrir l’antisèche"}
      title="Antisèche"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9.2 17.5h5.6M10 20.5h4M12 3.5a5.8 5.8 0 0 0-3.4 10.5c.7.5 1 1.2 1 2v1.5h4.8V16c0-.8.3-1.5 1-2A5.8 5.8 0 0 0 12 3.5z" />
      </svg>
      <svg viewBox="-34 -34 68 68" className="ra-lamp-rays" aria-hidden="true">
        {RAYS.map((angle, i) => (
          <line
            key={i}
            x1={25 * Math.cos(angle)}
            y1={25 * Math.sin(angle)}
            x2={31 * Math.cos(angle)}
            y2={31 * Math.sin(angle)}
          />
        ))}
      </svg>
    </button>
  );
}

// Tâche « Expression libre », dans le gabarit commun (cf. TaskLayout) :
// conversation avec le prof, question servie par l'application, indices que
// le prof donne si l'élève les accepte, réponse de l'élève (fautes de langue
// en rouge, de sens en violet) et, dans la même fenêtre sous un trait, le
// commentaire de chaque faute, sans note (cf. demande explicite du user) ;
// une réponse parfaite ouvre la déclinaison de la phrase (fenêtre
// « Déclinaison » puis son évaluation). Avant la question suivante, les
// fenêtres se referment de bas en haut (closing). À droite, de même largeur
// (cf. demande explicite du user) : le programme de la séance, en tuiles, puis,
// une fois la question affichée, la tuile de son sujet en bleu (avec sa
// légende). La pastille d'une tuile déroule sous la rangée, comme un volet qu'on
// baisse, le petit cours qui rappelle le sujet ; elle le remonte aussi. Le
// cours du sujet de chaque question s'ouvre de lui-même quand elle s'affiche,
// et se referme avec elle. Dessous, le suivi de la séance : chaque essai
// évalué, coché ou barré, sous son exercice.
// La fenêtre de l'exercice est un tableau : elle descend comme un volet quand
// le prof pose une question, puis ne se referme plus ; intitulée « Expression
// libre » ou « Déclinaison », son contenu s'efface à chaque réussite, puis
// l'exercice suivant s'y écrit (dans le sens de lecture de chaque ligne). La réponse et l'évaluation ne
// s'affichent que pour un essai raté ; elles se referment, comme l'indice, au
// passage à la déclinaison ou à la question suivante.
// composer(lamp) : sans Gemini Live, la réponse de l'élève (enregistrée ou
// écrite), sous les fenêtres de l'exercice, avec son évaluation (cf.
// StudentAnswer) : la fenêtre de l'évaluation n'a alors plus lieu d'être.
// L'antisèche n'y est plus affichée d'office : l'ampoule (lamp), à côté de la
// piste d'enregistrement, la déroule, avec le cours du sujet de la question ;
// elle se remonte d'elle-même SHEET_MS après le dernier geste. keepOnDone :
// toutes les fenêtres restent à l'écran après la dernière question (pendant
// l'au revoir du prof), jusqu'à la fin de la connexion (cf. TaskLayout).
export default function ExpressionBoard({
  teacher,
  topics,
  question,
  hints,
  evaluation,
  declension,
  declensionEvaluation,
  closing,
  done,
  notice,
  answering,
  languageSwitch,
  onNext,
  score,
  clock,
  composer,
  keepOnDone = false,
}) {
  // Cours déroulé sous la rangée de tuiles (index dans le programme), un seul à
  // la fois : celui du sujet de la question, tant que l'élève n'en a pas choisi
  // un autre (ou fermé) pour cette question ; aucun entre deux questions.
  const [chosenCourse, setChosenCourse] = useState({ question: null, index: null });
  const asked = question && !done ? question.number : null;
  // Antisèche à la demande (cf. Lamp) : aucun cours ne s'y ouvre de lui-même.
  const onDemand = Boolean(composer);
  const openCourse =
    chosenCourse.question === asked
      ? chosenCourse.index
      : !onDemand && asked !== null && topics?.current >= 0
        ? topics.current
        : null;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [touched, setTouched] = useState(0); // chaque geste dans l'antisèche relance son délai
  const foldRef = useRef(null);
  const closeSheet = useCallback(() => {
    setChosenCourse((chosen) => ({ ...chosen, index: null }));
    foldRef.current = setTimeout(() => setSheetOpen(false), FOLD_UP_MS);
  }, []);
  useEffect(() => {
    if (!sheetOpen) return undefined;
    const timer = setTimeout(closeSheet, SHEET_MS);
    return () => clearTimeout(timer);
  }, [sheetOpen, touched, closeSheet]);
  useEffect(() => () => clearTimeout(foldRef.current), []);
  const openSheet = () => {
    clearTimeout(foldRef.current);
    setChosenCourse({ question: asked, index: asked !== null && topics?.current >= 0 ? topics.current : null });
    setSheetOpen(true);
    setTouched((n) => n + 1);
  };
  const toggleCourse = (i) => {
    setChosenCourse({ question: asked, index: openCourse === i ? null : i });
    setTouched((n) => n + 1);
  };

  // La déclinaison ne s'affiche qu'une fois les fenêtres de la question fermées.
  const [foldedFor, setFoldedFor] = useState(null);
  useEffect(() => {
    if (!declension) return undefined;
    const timer = setTimeout(() => setFoldedFor(declension), FOLD_MS);
    return () => clearTimeout(timer);
  }, [declension]);
  const shownDeclension = declension && foldedFor === declension ? declension : null;
  const folding = Boolean(declension) && !shownDeclension;

  if (!teacher && !notice && !clock) return null;

  const speech = (notice || teacher) && (
    <>
      {notice && <p className="ra-alert">{notice}</p>}
      {teacher && (
        <TeacherSpeech key={teacher.id} line={teacher} mode={languageSwitch} />
      )}
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

  const key = question?.number;
  // Le tableau s'efface quand l'élève réussit l'exercice affiché, et avant la
  // question suivante.
  const success = score?.event?.ok && score.event.question === key ? score.event.kind : null;
  const erased =
    closing ||
    (success === "expression" && !shownDeclension) ||
    (success === "declension" && Boolean(shownDeclension));
  const content = done ? (
    <p className="ra-done">Toutes les questions ont été posées.</p>
  ) : shownDeclension ? (
    <>
      <p className="ra-declension-instruction">
        {DECLENSION_INSTRUCTIONS[shownDeclension.kind] ??
          DECLENSION_INSTRUCTIONS.subject}
      </p>
      <DeclensionSentence declension={shownDeclension} />
    </>
  ) : (
    question && (
      <div className="ra-instruction">
        <p className="ra-instruction-he" dir="rtl" lang="he">
          {question.hebrew}
        </p>
        {answering && !declension && (
          <p className="ra-answering">À toi de répondre</p>
        )}
      </div>
    )
  );
  // Chaque nouveau contenu s'écrit sur le tableau (cf. .ra-slate).
  const contentKey = done
    ? "done"
    : shownDeclension
      ? `declension-${key}`
      : question
        ? `question-${key}`
        : "empty";
  // La fenêtre redescend à chaque question posée ; entre deux questions, elle
  // reste ouverte, vide, sous le numéro de la précédente (celle du dernier essai).
  const boardFor = key ?? score?.event?.question;
  const exercise = (boardFor || done) && (
    <div key={contentKey} className={`ra-slate ${erased ? "ra-slate-erased" : ""}`}>
      {content}
    </div>
  );

  // Pendant la déclinaison, la réponse et l'évaluation sont celles de la
  // phrase déclinée. Une seule fenêtre : la réponse, un trait, puis le
  // commentaire de chaque faute surlignée, en puces (cf. .ra-assessment).
  const shownEvaluation = shownDeclension ? declensionEvaluation : evaluation;
  const assessment = shownEvaluation && (
    <div className="ra-assessment">
      <Answer evaluation={shownEvaluation} legend={!shownDeclension} />
      {shownEvaluation.errors.length > 0 && (
        <>
          <hr className="ra-assessment-rule" />
          <Evaluation evaluation={shownEvaluation} />
        </>
      )}
    </div>
  );

  const extra = !shownDeclension && hints.length > 0 && [
    {
      key: `hints-${key}`,
      label: "Indice",
      className: "ra-zone-hints",
      early: true,
      content: (
        <ul className="ra-hints">
          {hints.map((hint, i) => (
            <li key={i}>
              <span className="ra-instruction-label">{hint.label}</span>
              {hint.hebrew && (
                <span className="ra-hint-he" dir="rtl" lang="he">
                  {hint.hebrew}
                </span>
              )}
              {hint.french && <span className="ra-hint-fr">{hint.french}</span>}
            </li>
          ))}
        </ul>
      ),
    },
  ];

  // « Question suivante » sert après une évaluation ; pendant la déclinaison,
  // l'élève peut aussi passer. Elle est à droite, accolée à « Arrêter la
  // séance », grisée le reste du temps (cf. demande explicite du user).
  const canGoOn = !done && !closing && !folding && Boolean(evaluation || shownDeclension);
  const controls = clock && (
    <>
      <button type="button" className="ra-next ra-next-side" onClick={onNext} disabled={!canGoOn}>
        Question suivante
      </button>
      {clock}
    </>
  );

  // Programme de la séance, intitulé « Antisèche » (cf. demande explicite du
  // user) : le sujet de la question en bleu, une fois la question à l'écran.
  const material = (
    <Program
      topics={topics}
      active={Boolean(question) && !done}
      done={done}
      openCourse={openCourse}
      onToggle={toggleCourse}
      legend="Sujet de la question en cours"
    />
  );

  return (
    <TaskLayout
      conversation={conversation || null}
      exercise={exercise || null}
      exerciseKey={`board-${boardFor}`}
      exerciseLabel={shownDeclension ? "Déclinaison" : "Expression libre"}
      exercisePersistent
      answer={(!composer && assessment) || null}
      extra={extra || []}
      closing={closing || folding}
      clock={controls || null}
      material={material}
      materialLabel="Antisèche"
      followup={topics && <Followup history={score?.history ?? []} names={EXERCISE_NAMES} />}
      followupLabel="Suivi"
      finished={done && !keepOnDone}
      composer={
        composer &&
        composer(
          <Lamp key={asked ?? "none"} open={sheetOpen} onClick={sheetOpen ? closeSheet : openSheet} />,
        )
      }
      materialOpen={onDemand ? sheetOpen : undefined}
      onMaterialClose={closeSheet}
      balanced
    />
  );
}
