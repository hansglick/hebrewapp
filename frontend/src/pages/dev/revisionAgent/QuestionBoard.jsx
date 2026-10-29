import { useEffect, useState } from "react";
import { Answer, Evaluation } from "./Assessment";
import Followup from "./Followup";
import TaskLayout from "./TaskLayout";
import TeacherSpeech from "./TeacherSpeech";

const INSTRUCTION = "Trouve la question dont la réponse est la partie surlignée.";
const EXERCISE_NAMES = { question: "Question" };
// Durée de l'info-bulle de la pastille, pendant laquelle elle pulse (cf. .ra-hint-tip).
const HINT_TIP_MS = 4000;
// Effacement de la réponse précédente quand l'élève en redonne une (cf. .ra-assessment-erasing).
const ERASE_MS = 700;

// La phrase, ses morceaux cibles surlignés au stabilo l'un après l'autre (un
// seul, deux pour une question double ; cf. .ra-question-target), puis, au
// besoin, la pastille de l'indice, à gauche, au bout de la phrase.
function TargetSentence({ sentence, spans, children }) {
  const parts = [];
  let at = 0;
  [...spans]
    .sort((a, b) => a[0] - b[0])
    .forEach(([start, end], i) => {
      parts.push(sentence.slice(at, start));
      parts.push(
        <mark key={start} className="ra-question-target ra-highlighter" style={{ "--stroke": i }}>
          {sentence.slice(start, end)}
        </mark>,
      );
      at = end;
    });
  parts.push(sentence.slice(at));
  return (
    <div className="ra-question-line" dir="rtl">
      <p className="ra-declension-sentence" dir="rtl" lang="he">
        {parts}
      </p>
      {children}
    </div>
  );
}

// Pastille de l'indice (cf. demande explicite du user) : elle n'apparaît que
// si l'élève a raté la phrase ou hésite ; elle pulse, dans la couleur de la
// cible, le temps de son info-bulle, puis reste là, immobile, jusqu'au clic
// (aussi dans la complétion, cf. CompletionBoard).
export function HintDot({ onClick }) {
  const [tip, setTip] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setTip(false), HINT_TIP_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <span className="ra-hint-dot-wrap">
      {tip && <span className="ra-hint-tip">Clique pour obtenir un indice</span>}
      <button
        type="button"
        className={`ra-hint-dot ${tip ? "ra-hint-dot-pulse" : ""}`}
        onClick={onClick}
        aria-label="Afficher l'indice"
        title="Afficher l'indice"
      />
    </span>
  );
}

// Tâche « Question », dans le gabarit commun (cf. TaskLayout), comme la
// déclinaison (cf. demande explicite du user) : conversation avec le prof ; un
// tableau « Question », fixe dès la première phrase, où s'écrit chaque phrase
// (la cible surlignée), avec, au besoin, la pastille puis l'indice (le mot
// interrogatif en français), et qui s'efface à chaque réussite ; une seule
// fenêtre « Réponse » (la question de l'élève, puis, sous un trait, le
// commentaire de chaque faute), en store : elle apparaît dès que l'élève prend
// la parole pour la première fois, puis se déroule à chaque réponse et se
// remonte avant la phrase suivante, sa bande à poignées toujours visible. À
// droite, juste de la largeur des boutons : le suivi, puis « Question
// suivante » accolée à « Arrêter la séance ». Pas de programme : aucune phrase
// ne porte de concept.
export default function QuestionBoard({
  teacher,
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

  // L'élève redonne sa question : la précédente s'efface d'abord, comme au
  // tableau (cf. demande explicite du user), puis la nouvelle s'écrit. seq :
  // une réponse nouvelle s'écrit à nouveau, en streaming.
  const [stored, setCurrent] = useState({ evaluation: null, seq: 0 });
  const [storedErasing, setErasing] = useState(null);
  // Ce rendu-ci se sert déjà des nouvelles valeurs (l'état ne change qu'au
  // rendu suivant).
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
  const shown = exercise ?? lastExercise;
  const succeeded =
    score?.event?.ok && shown && score.event.question === shown.number;
  const erased = !done && (closing || !exercise || succeeded);
  const board = (shown || done) && (
    <div
      key={done ? "done" : `question-${shown.number}`}
      className={`ra-slate ${erased ? "ra-slate-erased" : ""}`}
    >
      {done ? (
        <p className="ra-done">Toutes les phrases ont été questionnées.</p>
      ) : (
        <>
          <p className="ra-declension-instruction">{INSTRUCTION}</p>
          <TargetSentence sentence={shown.sentence} spans={shown.spans}>
            {hint?.offered && !hint.text && !erased && (
              <HintDot key={shown.number} onClick={onHint} />
            )}
          </TargetSentence>
          {hint?.text && !erased && (
            <p className="ra-question-hint">
              Indice : <strong>{hint.text}</strong>
            </p>
          )}
        </>
      )}
    </div>
  );

  // Une seule fenêtre : la question de l'élève, un trait, puis le commentaire
  // de chaque faute surlignée (cf. .ra-assessment) ; réussie, seulement sa
  // question.
  const assessed = erasing ?? (evaluation ? current : null);
  const assessment = assessed && (
    <div
      key={assessed.seq}
      className={`ra-assessment ${erasing ? "ra-assessment-erasing" : ""}`}
    >
      <Answer evaluation={assessed.evaluation} legend={false} />
      {assessed.evaluation.errors.length > 0 && (
        <>
          <hr className="ra-assessment-rule" />
          <Evaluation evaluation={assessed.evaluation} />
        </>
      )}
    </div>
  );

  // « Question suivante » : après une évaluation, ou pour passer la phrase.
  const canGoOn = !done && !closing && Boolean(exercise);
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

  return (
    <TaskLayout
      conversation={conversation || null}
      exercise={board || null}
      exerciseKey="board"
      exerciseLabel="Question"
      exercisePersistent
      answer={assessment || null}
      answerBlind={Boolean(answerFrame)}
      closing={closing}
      clock={controls || null}
      followup={<Followup history={score?.history ?? []} names={EXERCISE_NAMES} />}
      followupLabel="Suivi"
      compactSide
      finished={done}
    />
  );
}
