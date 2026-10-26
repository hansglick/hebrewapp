import AnswerCard from "./AnswerCard";
import TeacherSpeech from "./TeacherSpeech";

// Ce que voit l'élève pendant la tâche « Déclinaison » : la dernière prise de
// parole du prof, la phrase à transformer (le sujet ou le pronom objet à
// modifier surligné), puis — au moment de la correction seulement — sa phrase
// telle que le prof l'a comprise, mots fautifs en rouge, réussi / échec.
export default function DeclensionBoard({ teacher, exercise, answer, notice }) {
  if (!teacher && !exercise && !answer && !notice) return null;

  return (
    <div className="card ra-board">
      {notice && <p className="ra-alert">{notice}</p>}
      {teacher && <TeacherSpeech key={teacher.id} line={teacher} />}

      {exercise && (
        <div className="ra-panel">
          <div className="ra-panel-head">
            <span className="ra-label">Phrase à transformer</span>
            <span className="muted">leçon {exercise.lesson}</span>
          </div>
          <p className="ra-answer" dir="rtl" lang="he">
            {exercise.sentence.slice(0, exercise.target[0])}
            <mark className="ra-target">{exercise.sentence.slice(...exercise.target)}</mark>
            {exercise.sentence.slice(exercise.target[1])}
          </p>
        </div>
      )}

      {answer && <AnswerCard answer={answer} />}
    </div>
  );
}
