import { useEffect, useRef } from "react";
import TeacherSpeech from "./TeacherSpeech";

// Ce que voit l'élève pendant la tâche « Compréhension de texte » : la
// dernière prise de parole du prof (question, correction…), séparée du texte
// de la leçon, affiché en entier toute la séance. Quand le prof donne la
// solution, la ou les phrases qui la contiennent sont surlignées.
export default function ComprehensionBoard({ teacher, text, highlight, notice }) {
  const phraseRefs = useRef([]);

  // La phrase surlignée peut être hors de vue : on la fait défiler jusqu'à elle.
  useEffect(() => {
    phraseRefs.current[highlight[0]]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [highlight]);

  if (!teacher && !text && !notice) return null;

  return (
    <div className="card ra-board">
      {notice && <p className="ra-alert">{notice}</p>}
      {teacher && <TeacherSpeech key={teacher.id} line={teacher} />}
      {text && (
        <div className="ra-panel">
          <div className="ra-panel-head">
            <span className="ra-label">Texte de la leçon</span>
            <span className="muted">leçon {text.lesson}</span>
          </div>
          {text.title && (
            <h3 className="ra-text-title" dir="rtl" lang="he">
              {text.title}
            </h3>
          )}
          <div className="ra-text" dir="rtl" lang="he">
            {text.phrases.map((phrase, i) => (
              <p
                key={i}
                ref={(el) => (phraseRefs.current[i] = el)}
                className={highlight.includes(i) ? "ra-text-solution" : undefined}
              >
                {phrase}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
