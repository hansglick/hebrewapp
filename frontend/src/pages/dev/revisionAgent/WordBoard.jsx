import AnswerCard from "./AnswerCard";
import highlighted from "./highlighted";
import TeacherSpeech from "./TeacherSpeech";

// Ce que voit l'élève pendant la tâche « Mot » : la dernière prise de parole
// du prof, le mot (ou le verbe) à employer avec sa traduction et l'indice
// (action ou concept) ; au moment de la correction, sa phrase telle que le
// prof l'a comprise (mots fautifs en rouge, réussi / échec) puis, toujours,
// la phrase d'origine, mot surligné.
export default function WordBoard({ teacher, exercise, answer, solution, notice }) {
  if (!teacher && !exercise && !answer && !notice) return null;

  return (
    <div className="card ra-board">
      {notice && <p className="ra-alert">{notice}</p>}
      {teacher && <TeacherSpeech key={teacher.id} line={teacher} />}

      {exercise && (
        <div className="ra-panel">
          <div className="ra-panel-head">
            <span className="ra-label">{exercise.kind === "verbe" ? "Verbe à employer" : "Mot à employer"}</span>
            <span className="muted">leçon {exercise.lesson}</span>
          </div>
          <p className="ra-word-hebrew" dir="rtl" lang="he">
            {exercise.word}
          </p>
          <p className="ra-word-french">{exercise.french}</p>
          <dl className="ra-clue">
            <dt>{exercise.hint.type === "action" ? "Action" : "Concept"}</dt>
            <dd>{exercise.hint.text}</dd>
          </dl>
        </div>
      )}

      {answer && <AnswerCard answer={answer} />}

      {solution && (
        <div className="ra-panel">
          <div className="ra-panel-head">
            <span className="ra-label">Phrase d'origine</span>
          </div>
          <p className="ra-answer" dir="rtl" lang="he">
            {highlighted(solution.sentence, solution.spans)}
          </p>
        </div>
      )}
    </div>
  );
}
