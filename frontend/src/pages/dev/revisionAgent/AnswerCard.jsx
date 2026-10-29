import { withoutNikkud } from "./hebrew";

// Compare les mots sans ponctuation ni voyelles (nikud).
const normalize = (word) => word.replace(/[֑-ׇ]/g, "").replace(/[^א-ת]/g, "");

// Réponse de l'élève telle que le prof l'a comprise (expression libre,
// déclinaison), affichée seulement au moment de la correction : mots fautifs
// en rouge et mention réussi / échec. Sans nikkoud.
export default function AnswerCard({ answer }) {
  const errors = new Set(answer.errors.map(normalize).filter(Boolean));

  return (
    <div className="ra-panel">
      <div className="ra-panel-head">
        <span className="ra-label">Ta réponse</span>
        <span className={`ra-result ${answer.success ? "ra-result-success" : "ra-result-failure"}`}>
          {answer.success ? "Réussi" : "Échec"}
        </span>
      </div>
      {answer.sentence ? (
        <p className="ra-answer" dir="rtl" lang="he">
          {withoutNikkud(answer.sentence).split(" ").map((word, i) => (
            <span key={i}>
              {i > 0 && " "}
              {errors.has(normalize(word)) ? <mark className="ra-answer-error">{word}</mark> : word}
            </span>
          ))}
        </p>
      ) : (
        <p className="muted">(pas de réponse)</p>
      )}
    </div>
  );
}
