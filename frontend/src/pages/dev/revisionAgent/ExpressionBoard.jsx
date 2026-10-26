import AnswerCard from "./AnswerCard";
import TeacherSpeech from "./TeacherSpeech";

// Ce que voit l'élève pendant la tâche « Expression libre » : la dernière
// prise de parole du prof, l'indice de la question en cours (mots en hébreu
// seul), puis — au moment de la correction seulement — sa phrase telle que le
// prof l'a comprise, mots fautifs en rouge, avec la mention réussi / échec.
export default function ExpressionBoard({ teacher, hint, answer, notice }) {
  if (!teacher && hint.length === 0 && !answer && !notice) return null;

  return (
    <div className="card ra-board">
      {notice && <p className="ra-alert">{notice}</p>}
      {teacher && <TeacherSpeech key={teacher.id} line={teacher} />}

      {hint.length > 0 && (
        <div className="ra-panel">
          <div className="ra-panel-head">
            <span className="ra-label">Indice</span>
          </div>
          <div className="ra-hint" dir="rtl" lang="he">
            {hint.map((word, i) => (
              <span key={i} className="ra-hint-word">
                {word}
              </span>
            ))}
          </div>
        </div>
      )}

      {answer && <AnswerCard answer={answer} />}
    </div>
  );
}
