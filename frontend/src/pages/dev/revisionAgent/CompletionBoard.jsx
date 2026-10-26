import AnswerCard from "./AnswerCard";
import highlighted from "./highlighted";
import TeacherSpeech from "./TeacherSpeech";

// Ce que voit l'élève pendant la tâche « Complétion » : la dernière prise de
// parole du prof, le début de la phrase à compléter et l'indice (action de la
// phrase, concept à pratiquer) ; au moment de la correction, sa phrase telle
// que le prof l'a comprise (mots fautifs en rouge, réussi / échec) puis la
// phrase d'origine comme réponse possible, mots du concept surlignés.
export default function CompletionBoard({ teacher, exercise, answer, solution, notice }) {
  if (!teacher && !exercise && !answer && !notice) return null;

  return (
    <div className="card ra-board">
      {notice && <p className="ra-alert">{notice}</p>}
      {teacher && <TeacherSpeech key={teacher.id} line={teacher} />}

      {exercise && (
        <div className="ra-panel">
          <div className="ra-panel-head">
            <span className="ra-label">Phrase à compléter</span>
            <span className="muted">leçon {exercise.lesson}</span>
          </div>
          <p className="ra-answer" dir="rtl" lang="he">
            {exercise.prefix} …
          </p>
          <dl className="ra-clue">
            {exercise.hint.action && (
              <>
                <dt>Action</dt>
                <dd>{exercise.hint.action}</dd>
              </>
            )}
            <dt>Concept</dt>
            <dd>{exercise.hint.concept}</dd>
          </dl>
        </div>
      )}

      {answer && <AnswerCard answer={answer} />}

      {solution && (
        <div className="ra-panel">
          <div className="ra-panel-head">
            <span className="ra-label">Réponse possible</span>
          </div>
          <p className="ra-answer" dir="rtl" lang="he">
            {highlighted(solution.sentence, solution.spans)}
          </p>
        </div>
      )}
    </div>
  );
}
