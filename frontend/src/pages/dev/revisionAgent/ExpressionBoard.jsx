import { Answer, Evaluation } from "./Assessment";
import TaskLayout from "./TaskLayout";
import TeacherSpeech from "./TeacherSpeech";

// L'évaluation de l'expression libre ne porte que sur la langue (cf.
// app.revision_agent.expression), notée de 0 à 5 étoiles.
const SCORES = [
  [
    "language",
    "Langue",
    "accords, conjugaison, vocabulaire, structure de la phrase",
  ],
];

// Tâche « Expression libre », dans le gabarit commun (cf. TaskLayout), comme
// la compréhension de texte mais sans texte : conversation avec le prof,
// question qu'il pose (avec son indice, mots du vocabulaire en hébreu seul),
// réponse de l'élève (fautes en rouge), évaluation (puis bouton « Question
// suivante »). La question n'apparaît que lorsque le prof la pose, la réponse
// et l'évaluation que lorsque le prof a évalué.
export default function ExpressionBoard({
  teacher,
  question,
  evaluation,
  done,
  notice,
  paused,
  onNext,
}) {
  if (!teacher && !notice) return null;

  const conversation = (
    <>
      {notice && <p className="ra-alert">{notice}</p>}
      {teacher && <TeacherSpeech key={teacher.id} line={teacher} />}
    </>
  );

  const exercise = done ? (
    <p className="ra-done">Toutes les questions ont été posées.</p>
  ) : (
    question && (
      <div className="ra-instruction">
        <span className="ra-instruction-label">Question</span>
        <p className="ra-instruction-he" dir="rtl" lang="he">
          {question.hebrew}
        </p>
        {question.hint.length > 0 && (
          <>
            <span className="ra-instruction-label">Indice</span>
            <div className="ra-hint" dir="rtl" lang="he">
              {question.hint.map((word, i) => (
                <span key={i} className="ra-hint-word">
                  {word}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    )
  );

  const assessment = evaluation && (
    <>
      <Evaluation evaluation={evaluation} scores={SCORES} />
      {evaluation.solution && (
        <div className="ra-solution">
          <span className="ra-label">Proposition</span>
          <p className="ra-solution-he" dir="rtl" lang="he">
            {evaluation.solution}
          </p>
        </div>
      )}
      {paused && (
        <button type="button" className="ra-next" onClick={onNext}>
          Question suivante
        </button>
      )}
    </>
  );

  return (
    <TaskLayout
      conversation={conversation}
      exercise={exercise || null}
      exerciseKey={done ? "done" : question?.number}
      answer={
        evaluation ? <Answer evaluation={evaluation} legend={false} /> : null
      }
      evaluation={assessment || null}
    />
  );
}
