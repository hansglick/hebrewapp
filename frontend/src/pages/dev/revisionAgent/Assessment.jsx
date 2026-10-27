// Réponse de l'élève et son évaluation silencieuse par le prof, communes à la
// compréhension de texte et à l'expression libre (cf.
// app.revision_agent.evaluation) : fautes surlignées et commentées, notes de
// 0 à 5 étoiles, chacune justifiée si elle n'est pas parfaite.

// Compare les mots sans ponctuation ni voyelles (nikud).
const normalize = (word) => word.replace(/[֑-ׇ]/g, "").replace(/[^א-ת]/g, "");

const MAX_STARS = 5;

// Deux types de fautes, chacun dans sa couleur (cf. demande explicite du user).
const ERROR_KINDS = {
  language: "faute de langue",
  truth: "faux d'après le texte",
};

function ErrorWord({ kind, children }) {
  return (
    <mark
      className={`ra-answer-error ra-error-${kind}`}
      title={ERROR_KINDS[kind]}
    >
      {children}
    </mark>
  );
}

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

// Réponse de l'élève, telle que le prof l'a entendue, les mots fautifs
// surlignés selon leur type ; legend : la légende des couleurs (inutile s'il
// n'y a qu'un type de faute).
export function Answer({ evaluation, legend = true }) {
  const kinds = new Map(
    evaluation.errors
      .filter((e) => normalize(e.word))
      .map((e) => [normalize(e.word), e.kind]),
  );
  if (!evaluation.answer) return <p className="muted">(pas de réponse)</p>;
  const present = Object.keys(ERROR_KINDS).filter((kind) =>
    [...kinds.values()].includes(kind),
  );
  return (
    <>
      <p className="ra-answer" dir="rtl" lang="he">
        {evaluation.answer.split(" ").map((word, i) => (
          <span key={i}>
            {i > 0 && " "}
            {kinds.has(normalize(word)) ? (
              <ErrorWord kind={kinds.get(normalize(word))}>{word}</ErrorWord>
            ) : (
              word
            )}
          </span>
        ))}
      </p>
      {legend && present.length > 0 && (
        <p className="ra-error-legend">
          {present.map((kind) => (
            <span key={kind}>
              <span className={`ra-legend-swatch ra-error-${kind}`} />
              {ERROR_KINDS[kind]}
            </span>
          ))}
        </p>
      )}
    </>
  );
}

// Évaluation de la réponse : le commentaire de chaque faute surlignée, puis
// les notes en étoiles (scores : [clé, libellé, description]). Le prof ne la
// commente pas.
export function Evaluation({ evaluation, scores }) {
  return (
    <>
      {evaluation.errors.length > 0 && (
        <ul className="ra-error-comments">
          {evaluation.errors.map((error, i) => (
            <li key={i}>
              {error.word && (
                <span dir="rtl" lang="he">
                  <ErrorWord kind={error.kind}>{error.word}</ErrorWord>
                </span>
              )}
              <span>{error.comment}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="ra-scores">
        {scores.map(([key, label, description]) => (
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
