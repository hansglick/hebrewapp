import { useState } from "react";
import { Answer, Evaluation } from "./Assessment";
import DeclensionSentence from "./DeclensionSentence";
import Followup from "./Followup";
import Program from "./Program";
import TaskLayout from "./TaskLayout";
import TeacherSpeech from "./TeacherSpeech";

const INSTRUCTIONS = {
  subject: "Redis la phrase en changeant le sujet surligné.",
  preposition: "Redis la phrase en changeant le mot surligné.",
};

const EXERCISE_NAMES = { declension: "Déclinaison" };

// Tâche « Déclinaison », dans le gabarit commun (cf. TaskLayout), comme la
// déclinaison de l'expression libre (cf. demande explicite du user) :
// conversation avec le prof ; un tableau « Déclinaison », fixe dès la première
// phrase, où s'écrit chaque phrase (le mot à changer surligné, ce qu'il devient
// en français dessous) et qui s'efface à chaque réussite ; une seule fenêtre
// « Réponse » (la phrase de l'élève, puis, sous un trait, le commentaire de
// chaque faute), qui se referme vers le haut avant la phrase suivante. À
// droite : le programme de la séance (sujets et petits cours), le suivi, puis
// « Question suivante » accolée à « Arrêter la séance », grisée quand elle ne
// sert pas.
export default function DeclensionBoard({
  teacher,
  topics,
  declension,
  evaluation,
  closing,
  done,
  notice,
  languageSwitch,
  onNext,
  score,
  clock,
}) {
  // Dernière phrase donnée : elle reste au tableau, effacée, entre deux phrases.
  const [lastDeclension, setLastDeclension] = useState(null);
  if (declension && declension !== lastDeclension) setLastDeclension(declension);

  // Cours déroulé sous la rangée de tuiles : celui du sujet de la phrase en
  // cours, tant que l'élève n'en a pas choisi un autre (ou fermé) pour cette
  // phrase ; aucun entre deux phrases.
  const [chosenCourse, setChosenCourse] = useState({ number: null, index: null });
  const number = declension && !done ? declension.number : null;
  const openCourse =
    chosenCourse.number === number
      ? chosenCourse.index
      : number !== null && topics?.current >= 0
        ? topics.current
        : null;
  const toggleCourse = (i) =>
    setChosenCourse({ number, index: openCourse === i ? null : i });

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

  // Le tableau s'efface quand l'élève réussit la phrase affichée, et avant la
  // suivante (cf. .ra-slate).
  const shown = declension ?? lastDeclension;
  const succeeded =
    score?.event?.ok && shown && score.event.question === shown.number;
  const erased = !done && (closing || !declension || succeeded);
  const exercise = (shown || done) && (
    <div
      key={done ? "done" : `declension-${shown.number}`}
      className={`ra-slate ${erased ? "ra-slate-erased" : ""}`}
    >
      {done ? (
        <p className="ra-done">Toutes les phrases ont été déclinées.</p>
      ) : (
        <>
          <p className="ra-declension-instruction">
            {INSTRUCTIONS[shown.kind] ?? INSTRUCTIONS.subject}
          </p>
          <DeclensionSentence declension={shown} />
        </>
      )}
    </div>
  );

  // Une seule fenêtre : la phrase de l'élève, un trait, puis le commentaire de
  // chaque faute surlignée (cf. .ra-assessment) ; réussie, seulement sa phrase.
  const assessment = evaluation && (
    <div className="ra-assessment">
      <Answer evaluation={evaluation} legend={false} />
      {evaluation.errors.length > 0 && (
        <>
          <hr className="ra-assessment-rule" />
          <Evaluation evaluation={evaluation} />
        </>
      )}
    </div>
  );

  // « Question suivante » : après une évaluation, ou pour passer la phrase.
  const canGoOn = !done && !closing && Boolean(declension);
  const controls = clock && (
    <>
      <button
        type="button"
        className="ra-next ra-next-side"
        onClick={onNext}
        disabled={!canGoOn}
      >
        Question suivante
      </button>
      {clock}
    </>
  );

  const material = (
    <Program
      topics={topics}
      active={Boolean(declension) && !done}
      done={done}
      openCourse={openCourse}
      onToggle={toggleCourse}
      legend="Sujet de la phrase en cours"
    />
  );

  return (
    <TaskLayout
      conversation={conversation || null}
      exercise={exercise || null}
      exerciseKey="board"
      exerciseLabel="Déclinaison"
      exercisePersistent
      answer={assessment || null}
      closing={closing}
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
