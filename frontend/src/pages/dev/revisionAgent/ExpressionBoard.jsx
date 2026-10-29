import { useEffect, useState } from "react";
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
}) {
  // Cours déroulé sous la rangée de tuiles (index dans le programme), un seul à
  // la fois : celui du sujet de la question, tant que l'élève n'en a pas choisi
  // un autre (ou fermé) pour cette question ; aucun entre deux questions.
  const [chosenCourse, setChosenCourse] = useState({ question: null, index: null });
  const asked = question && !done ? question.number : null;
  const openCourse =
    chosenCourse.question === asked
      ? chosenCourse.index
      : asked !== null && topics?.current >= 0
        ? topics.current
        : null;
  const toggleCourse = (i) =>
    setChosenCourse({ question: asked, index: openCourse === i ? null : i });

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

  // Programme de la séance : le sujet de la question en bleu, une fois la
  // question à l'écran.
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
      answer={assessment || null}
      extra={extra || []}
      closing={closing || folding}
      clock={controls || null}
      material={material}
      materialLabel="Programme"
      followup={topics && <Followup history={score?.history ?? []} names={EXERCISE_NAMES} />}
      followupLabel="Suivi"
      finished={done}
      balanced
    />
  );
}
