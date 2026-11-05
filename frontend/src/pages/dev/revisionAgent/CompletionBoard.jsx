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

// Les puces de l'évaluation : seulement les axes en faute (cf. demande
// explicite du user), le nom de chacun, « : », puis sa remarque, en italique ;
// rien si tous sont bons.
export function Dimensions({ dimensions }) {
  const failed = dimensions.filter((d) => !d.ok);
  if (failed.length === 0) return null;
  return (
    <ul className="ra-completion-dimensions">
      {failed.map((d) => (
        <li key={d.name}>
          <strong className="ra-dimension-name">{d.name} :</strong>
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
  composer,
  keepOnDone = false,
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
            {/* Premier indice (l'action) : il glisse entre le début de phrase et la contrainte (cf. demande
                explicite du user). */}
            {hint?.action && !erased && (
              <li className="ra-completion-hint-line">
                <div className="ra-completion-hint-inner">
                  <p className="ra-question-hint">
                    Indice : <strong>{hint.action}</strong>
                  </p>
                </div>
              </li>
            )}
            <li className="ra-completion-constraint-line">
              <strong className="ra-completion-constraint">
                {shown.constraint.charAt(0).toUpperCase() + shown.constraint.slice(1)}
              </strong>
            </li>
          </ul>
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
      // Sans Gemini Live : la réponse enregistrée de l'élève (cf. StudentAnswer), et les fenêtres qui restent à la fin
      // de la séance, jusqu'à la fin de la connexion (keepOnDone).
      composer={composer && composer(null)}
      conversation={conversation || null}
      exercise={board || null}
      exerciseKey="board"
      exerciseLabel="Complète la phrase"
      exercisePersistent
      // Sans Gemini Live, l'évaluation s'affiche dans la fenêtre de la réponse (cf. StudentAnswer).
      answer={(!composer && assessment) || null}
      // Sans Gemini Live, pas de fenêtre « Réponse » : la réponse et son évaluation sont dans celle de l'élève.
      answerBlind={!composer && Boolean(answerFrame)}
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
      finished={done && !keepOnDone}
    />
  );
}
