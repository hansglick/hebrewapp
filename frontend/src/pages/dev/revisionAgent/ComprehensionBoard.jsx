import { useEffect, useRef, useState } from "react";
import TaskLayout from "./TaskLayout";
import TeacherSpeech from "./TeacherSpeech";

// Compare les mots sans ponctuation ni voyelles (nikud).
const normalize = (word) => word.replace(/[֑-ׇ]/g, "").replace(/[^א-ת]/g, "");

// Les deux dimensions de l'évaluation (cf. app.revision_agent.comprehension), notées de 0 à 5 étoiles.
const SCORES = [
  [
    "language",
    "Langue",
    "accords, conjugaison, vocabulaire, structure de la phrase",
  ],
  [
    "comprehension",
    "Compréhension",
    "la réponse est-elle vraie d'après le texte ?",
  ],
];
const MAX_STARS = 5;

function Stars({ count }) {
  return (
    <span
      className="ra-stars"
      role="img"
      aria-label={`${count} étoile${count > 1 ? "s" : ""} sur ${MAX_STARS}`}
    >
      {Array.from({ length: MAX_STARS }, (_, i) => (
        <span
          key={i}
          className={i < count ? "ra-star-on" : "ra-star-off"}
          aria-hidden="true"
        >
          ★
        </span>
      ))}
    </span>
  );
}

// Réponse de l'élève, telle que le prof l'a entendue, fautes en rouge.
function Answer({ evaluation }) {
  const errors = new Set(
    evaluation.errors.map((e) => normalize(e.word)).filter(Boolean),
  );
  if (!evaluation.answer) return <p className="muted">(pas de réponse)</p>;
  return (
    <p className="ra-answer" dir="rtl" lang="he">
      {evaluation.answer.split(" ").map((word, i) => (
        <span key={i}>
          {i > 0 && " "}
          {errors.has(normalize(word)) ? (
            <mark className="ra-answer-error">{word}</mark>
          ) : (
            word
          )}
        </span>
      ))}
    </p>
  );
}

// Évaluation de la réponse : le commentaire de chaque faute surlignée, puis
// les deux notes en étoiles, chacune justifiée si elle n'est pas parfaite.
// Le prof ne la commente pas.
function Evaluation({ evaluation }) {
  return (
    <>
      {evaluation.errors.length > 0 && (
        <ul className="ra-error-comments">
          {evaluation.errors.map((error, i) => (
            <li key={i}>
              {error.word && (
                <mark className="ra-answer-error" dir="rtl" lang="he">
                  {error.word}
                </mark>
              )}
              <span>{error.comment}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="ra-scores">
        {SCORES.map(([key, label, description]) => (
          <div key={key} className="ra-score">
            <div className="ra-score-head">
              <span className="ra-score-label" title={description}>
                {label}
              </span>
              <Stars count={evaluation[key].stars} />
            </div>
            {evaluation[key].justification && (
              <p className="ra-score-why">{evaluation[key].justification}</p>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// Phrase du texte, les extraits qui répondent à la question ([début, fin])
// mis en évidence.
function Phrase({ phrase, spans }) {
  const parts = [];
  let at = 0;
  [...spans]
    .sort((a, b) => a[0] - b[0])
    .forEach(([start, end], i) => {
      if (start < at) return;
      parts.push(
        phrase.slice(at, start),
        <mark key={i} className="ra-text-excerpt">
          {phrase.slice(start, end)}
        </mark>,
      );
      at = end;
    });
  parts.push(phrase.slice(at));
  return parts;
}

// Tâche « Compréhension de texte », dans le gabarit commun (cf. TaskLayout) :
// conversation avec le prof, question servie par l'application, réponse de
// l'élève (fautes en rouge), évaluation (puis bouton « Question suivante »)
// et, à droite, le texte de la leçon — à l'évaluation, la ou les phrases qui
// contiennent la solution y sont surlignées, et l'extrait exact qui répond à
// la question mis en évidence ; le texte peut être réduit (une nouvelle
// solution surlignée le rouvre). La question n'apparaît que
// lorsque le prof la pose, la réponse et l'évaluation que lorsque le prof a
// évalué.
export default function ComprehensionBoard({
  teacher,
  text,
  highlight,
  excerpts,
  question,
  evaluation,
  done,
  notice,
  paused,
  onNext,
}) {
  const phraseRefs = useRef([]);
  // Surlignage en cours au moment où le texte a été réduit : une nouvelle solution surlignée le rouvre.
  const [collapsedFor, setCollapsedFor] = useState(null);
  const collapsed =
    collapsedFor !== null &&
    (highlight.length === 0 || collapsedFor === highlight);

  // La phrase surlignée peut être hors de vue : on la fait défiler jusqu'à elle.
  useEffect(() => {
    phraseRefs.current[highlight[0]]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [highlight]);

  if (!teacher && !text && !notice) return null;

  const conversation = (notice || teacher) && (
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
      </div>
    )
  );

  const assessment = evaluation && (
    <>
      <Evaluation evaluation={evaluation} />
      {paused && (
        <button type="button" className="ra-next" onClick={onNext}>
          Question suivante
        </button>
      )}
    </>
  );

  const material = text && !collapsed && (
    <>
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
            <Phrase
              phrase={phrase}
              spans={excerpts
                .filter(([p]) => p === i)
                .map(([, start, end]) => [start, end])}
            />
          </p>
        ))}
      </div>
    </>
  );

  return (
    <TaskLayout
      conversation={conversation || null}
      exercise={exercise || null}
      exerciseKey={done ? "done" : question?.number}
      answer={evaluation ? <Answer evaluation={evaluation} /> : null}
      evaluation={assessment || null}
      material={
        material ||
        (collapsed && <p className="muted ra-zone-empty">Texte réduit.</p>) ||
        null
      }
      materialLabel={text ? `Texte de la leçon ${text.lesson}` : "Texte"}
      materialAside={
        text && (
          <button
            type="button"
            className="ra-ghost"
            onClick={() => setCollapsedFor(collapsed ? null : highlight)}
            aria-expanded={!collapsed}
          >
            {collapsed ? "Afficher le texte" : "Réduire"}
          </button>
        )
      }
    />
  );
}
