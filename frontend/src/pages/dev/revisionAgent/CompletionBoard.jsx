import { useEffect, useState } from "react";
import { Answer, Evaluation } from "./Assessment";
import Followup from "./Followup";
import Program from "./Program";
import { HintDot } from "./QuestionBoard";
import TaskLayout from "./TaskLayout";
import TeacherSpeech from "./TeacherSpeech";

const EXERCISE_NAMES = { completion: "Complétion" };
// Effacement de la réponse précédente quand l'élève en redonne une (cf. .ra-assessment-erasing).
const ERASE_MS = 700;

// Le début de phrase (cf. demande explicite du user) ; avec le second indice,
// le début prolongé, sa partie nouvelle surlignée comme l'extrait à lire de la
// lecture (cf. .ra-completion-mark).
function Prefix({ prefix, longer }) {
  const added = longer && longer.startsWith(prefix) ? longer.slice(prefix.length) : "";
  return (
    <span className="ra-completion-prefix" dir="rtl" lang="he">
      {longer && !added ? longer : prefix}
      {added && (
        <mark className="ra-completion-mark" lang="he">
          {added}
        </mark>
      )}{" "}
      …
    </span>
  );
}

// Pouce levé (dimension validée) ou baissé, blanc sur un rond bleu, de la
// couleur de la bande de la fenêtre « Réponse ».
function ThumbIcon({ up }) {
  return (
    <svg viewBox="0 0 40 40" className="ra-thumb-icon" aria-hidden="true">
      <circle cx="20" cy="20" r="19" />
      <g transform={`${up ? "" : "rotate(180 20 20) "}translate(9.5 9.5) scale(0.875)`}>
        <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" />
      </g>
    </svg>
  );
}

// Les trois puces de l'évaluation : contrainte, plausibilité, grammaire, le nom
// de chacune, « : », le pouce levé ou baissé, puis sa remarque, en italique.
function Dimensions({ dimensions }) {
  return (
    <ul className="ra-completion-dimensions">
      {dimensions.map((d) => (
        <li key={d.name}>
          <strong className="ra-dimension-name">
            {d.name} :
            <span title={d.ok ? "Validé" : "Non validé"}>
              <ThumbIcon up={d.ok} />
            </span>
          </strong>
          <em className="ra-dimension-text">{d.text}</em>
        </li>
      ))}
    </ul>
  );
}

// Tâche « Complétion », dans le gabarit commun (cf. TaskLayout), comme la
// question (cf. demande explicite du user) : conversation avec le prof ; un
// tableau « Complétion », fixe dès la première phrase, avec deux puces (le
// début de la phrase, la consigne), puis, à la demande, les indices (l'action
// de la phrase, puis le début prolongé, qui remplace le premier), et qui
// s'efface à chaque réussite ; la pastille, au bout du début de phrase, offre
// l'indice suivant après un échec ou une hésitation et disparaît au clic. Une
// seule fenêtre « Réponse » : la phrase de l'élève ; ratée, puis sous un
// trait, le commentaire de chaque faute, puis, sous un second trait, les
// trois puces de l'évaluation. À droite : le programme (les concepts retenus,
// celui de la consigne en bleu, son petit cours déroulé), le suivi, puis
// « Complétion suivante » accolée à « Arrêter la séance ». La phrase d'origine
// ne s'affiche jamais.
export default function CompletionBoard({
  teacher,
  topics,
  exercise,
  evaluation,
  hint,
  answerFrame,
  closing,
  score,
  done,
  notice,
  languageSwitch,
  onHint,
  onNext,
  clock,
}) {
  // Dernière phrase donnée : elle reste au tableau, effacée, entre deux phrases.
  const [lastExercise, setLastExercise] = useState(null);
  if (exercise && exercise !== lastExercise) setLastExercise(exercise);

  // L'élève redonne sa phrase : la précédente s'efface d'abord (cf. QuestionBoard).
  const [stored, setCurrent] = useState({ evaluation: null, seq: 0 });
  const [storedErasing, setErasing] = useState(null);
  let current = stored;
  let erasing = storedErasing;
  if (evaluation !== stored.evaluation) {
    if (stored.evaluation && !closing) {
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

  // Cours déroulé sous les tuiles du programme : celui du concept de la phrase
  // en cours, tant que l'élève n'en a pas choisi un autre (cf. DeclensionBoard).
  const [chosenCourse, setChosenCourse] = useState({ number: null, index: null });
  const number = exercise && !done ? exercise.number : null;
  const openCourse =
    chosenCourse.number === number
      ? chosenCourse.index
      : number !== null && topics?.current >= 0
        ? topics.current
        : null;
  const toggleCourse = (i) => setChosenCourse({ number, index: openCourse === i ? null : i });

  if (!teacher && !notice && !clock) return null;

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

  // Le tableau s'efface quand l'élève réussit la phrase affichée, et avant la
  // suivante (cf. .ra-slate).
  const shown = exercise ?? lastExercise;
  const succeeded = score?.event?.ok && shown && score.event.question === shown.number;
  const erased = !done && (closing || !exercise || succeeded);
  const board = (shown || done) && (
    <div key={done ? "done" : `completion-${shown.number}`} className={`ra-slate ${erased ? "ra-slate-erased" : ""}`}>
      {done ? (
        <p className="ra-done">Toutes les phrases ont été complétées.</p>
      ) : (
        <>
          <ul className="ra-completion-items">
            {/* L'hébreu, de droite à gauche, calé à droite : la pastille au bout de la phrase, à gauche. */}
            <li className="ra-completion-line" dir="rtl">
              <Prefix prefix={shown.prefix} longer={hint?.prefix} />
              {hint?.offered && !erased && <HintDot key={`${shown.number}-${hint.action ? 2 : 1}`} onClick={onHint} />}
            </li>
            <li className="ra-completion-constraint-line">
              <strong className="ra-completion-constraint">
                {shown.constraint.charAt(0).toUpperCase() + shown.constraint.slice(1)}
              </strong>
            </li>
          </ul>
          {hint?.action && !erased && (
            <p className="ra-question-hint">
              Indice :{" "}
              <mark className="ra-completion-mark" lang="fr">
                {hint.action}
              </mark>
            </p>
          )}
        </>
      )}
    </div>
  );

  // Une seule fenêtre : la phrase de l'élève ; ratée, un trait, le commentaire
  // de chaque faute surlignée, puis les trois puces (cf. .ra-assessment).
  const assessed = erasing ?? (evaluation ? current : null);
  const assessment = assessed && (
    <div key={assessed.seq} className={`ra-assessment ${erasing ? "ra-assessment-erasing" : ""}`}>
      <Answer evaluation={assessed.evaluation} legend={false} />
      {assessed.evaluation.errors.length > 0 && (
        <>
          <hr className="ra-assessment-rule" />
          <Evaluation evaluation={assessed.evaluation} />
          <hr className="ra-assessment-rule" />
          <Dimensions dimensions={assessed.evaluation.dimensions ?? []} />
        </>
      )}
    </div>
  );

  // « Complétion suivante » : après une évaluation, ou pour passer la phrase.
  const canGoOn = !done && !closing && Boolean(exercise);
  const controls = clock && (
    <>
      <button type="button" className="ra-next ra-next-side" onClick={onNext} disabled={!canGoOn}>
        Complétion suivante
      </button>
      {clock}
    </>
  );

  return (
    <TaskLayout
      conversation={conversation || null}
      exercise={board || null}
      exerciseKey="board"
      exerciseLabel="Complète la phrase"
      exercisePersistent
      answer={assessment || null}
      answerBlind={Boolean(answerFrame)}
      closing={closing}
      clock={controls || null}
      material={
        <Program
          topics={topics}
          active={Boolean(exercise) && !done}
          done={done}
          openCourse={openCourse}
          onToggle={toggleCourse}
          legend="Concept de la consigne en cours"
        />
      }
      materialLabel="Programme"
      followup={topics && <Followup history={score?.history ?? []} names={EXERCISE_NAMES} />}
      followupLabel="Suivi"
      wideMain
      finished={done}
    />
  );
}
