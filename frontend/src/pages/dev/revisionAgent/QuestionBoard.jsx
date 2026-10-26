import AnswerCard from "./AnswerCard";
import TeacherSpeech from "./TeacherSpeech";

// Ce que voit l'élève pendant la tâche « Question » : la dernière prise de
// parole du prof, la phrase (la réponse) et l'indice (le groupe interrogatif) ;
// au moment de la correction, sa question telle que le prof l'a comprise (mots
// fautifs en rouge, réussi / échec) puis, toujours, la question modèle.
export default function QuestionBoard({ teacher, exercise, answer, solution, notice }) {
  if (!teacher && !exercise && !answer && !notice) return null;

  return (
    <div className="card ra-board">
      {notice && <p className="ra-alert">{notice}</p>}
      {teacher && <TeacherSpeech key={teacher.id} line={teacher} />}

      {exercise && (
        <div className="ra-panel">
          <div className="ra-panel-head">
            <span className="ra-label">Réponse</span>
            <span className="muted">leçon {exercise.lesson}</span>
          </div>
          <p className="ra-answer" dir="rtl" lang="he">
            {exercise.sentence}
          </p>
          <dl className="ra-clue">
            <dt>Indice</dt>
            <dd>{exercise.hint}</dd>
          </dl>
        </div>
      )}

      {answer && <AnswerCard answer={answer} />}

      {solution && (
        <div className="ra-panel">
          <div className="ra-panel-head">
            <span className="ra-label">Question modèle</span>
          </div>
          <p className="ra-answer" dir="rtl" lang="he">
            {solution.sentence}
          </p>
        </div>
      )}
    </div>
  );
}
