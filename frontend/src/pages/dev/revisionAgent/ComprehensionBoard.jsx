import { useEffect, useRef, useState } from "react";
import TeacherSpeech from "./TeacherSpeech";

// Ce que voit l'élève pendant la tâche « Compréhension de texte » : deux
// fenêtres bien séparées (côte à côte sur grand écran, l'une sous l'autre sur
// mobile), pour aller et venir facilement de l'une à l'autre — la dernière
// prise de parole du prof (question, correction…) et le texte de la leçon,
// affiché une fois la consigne donnée, réductible, qui défile dans sa propre
// fenêtre. Quand le prof donne la solution, la ou les phrases qui la
// contiennent sont surlignées.
export default function ComprehensionBoard({ teacher, text, highlight, notice }) {
  // Surlignage en cours au moment où le texte a été réduit : une nouvelle solution surlignée le rouvre.
  const [collapsedFor, setCollapsedFor] = useState(null);
  const collapsed = collapsedFor !== null && (highlight.length === 0 || collapsedFor === highlight);
  const phraseRefs = useRef([]);

  // La phrase surlignée peut être hors de vue : on la fait défiler jusqu'à elle.
  useEffect(() => {
    phraseRefs.current[highlight[0]]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [highlight]);

  if (!teacher && !text && !notice) return null;

  return (
    <div className="ra-duo">
      <section className="card ra-window" aria-label="Le prof">
        <div className="ra-panel-head">
          <span className="ra-label">Le prof</span>
        </div>
        {notice && <p className="ra-alert">{notice}</p>}
        {teacher ? (
          <TeacherSpeech key={teacher.id} line={teacher} />
        ) : (
          <p className="muted">Le prof va prendre la parole…</p>
        )}
      </section>

      {text && (
        <section className="card ra-window" aria-label="Texte de la leçon">
          <div className="ra-panel-head">
            <span className="ra-label">Texte de la leçon {text.lesson}</span>
            <button
              type="button"
              className="ra-ghost"
              onClick={() => setCollapsedFor(collapsed ? null : highlight)}
              aria-expanded={!collapsed}
            >
              {collapsed ? "Afficher le texte" : "Réduire"}
            </button>
          </div>
          {!collapsed && (
            <div className="ra-window-body">
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
        </section>
      )}
    </div>
  );
}
