// Réponse de l'élève et son évaluation silencieuse par le prof, communes à la
// compréhension de texte et à l'expression libre (cf.
// app.revision_agent.evaluation) : fautes surlignées et commentées, sans note
// (cf. demande explicite du user). La réponse et ses mots fautifs s'affichent
// sans nikkoud.

import { useEffect, useMemo, useState } from "react";
import { graphemes, withoutNikkud } from "./hebrew";
import { SPEECH_STEP_MS } from "./TeacherSpeech";

// Compare les mots sans ponctuation ni voyelles (nikud).
const normalize = (word) => word.replace(/[֑-ׇ]/g, "").replace(/[^א-ת]/g, "");

// Deux types de fautes, chacun dans sa couleur (cf. demande explicite du user).
const ERROR_KINDS = {
  language: "faute de langue",
  truth: "faux d'après le texte",
  sense: "incohérent ou hors de propos", // expression libre (plausibilité)
  reading: "erreur de lecture", // lecture à voix haute
};

// kinds : le ou les types de faute du mot ; un mot qui porte les deux est
// surligné en violet et souligné en rouge. stroke : surligné au stabilo, le
// n-ième (cf. .ra-highlighter).
function ErrorWord({ kinds, stroke, children }) {
  const style = kinds.length > 1 ? "both" : kinds[0];
  return (
    <mark
      className={`ra-answer-error ra-error-${style}${
        stroke !== undefined ? " ra-highlighter" : ""
      }`}
      style={stroke !== undefined ? { "--stroke": stroke } : undefined}
      title={kinds.map((kind) => ERROR_KINDS[kind]).join(" + ")}
    >
      {children}
    </mark>
  );
}

// Type(s) de faute de chaque mot de la réponse. Une faute peut porter sur
// plusieurs mots (« מיץ תפוזים ») : on cherche la suite de mots dans la
// réponse, sinon chacun de ses mots séparément. Un même mot fautif plusieurs
// fois (« דוד » mal lu trois fois) : chaque faute prend l'occurrence suivante,
// pas encore surlignée.
function errorKinds(words, errors) {
  const keys = words.map(normalize);
  const kinds = words.map(() => new Set());
  errors.forEach((error) => {
    const parts = error.word.split(/\s+/).map(normalize).filter(Boolean);
    if (parts.length === 0) return;
    const matches = (i) => parts.every((part, j) => keys[i + j] === part);
    const free = (i) => parts.every((_, j) => !kinds[i + j].has(error.kind));
    const first = keys.findIndex((_, i) => matches(i));
    const unclaimed = keys.findIndex((_, i) => matches(i) && free(i));
    const start = unclaimed >= 0 ? unclaimed : first;
    keys.forEach((key, i) => {
      const inSequence =
        start >= 0
          ? i >= start && i < start + parts.length
          : parts.includes(key);
      if (inSequence) kinds[i].add(error.kind);
    });
  });
  return kinds.map((set) => [...set]);
}

// Réponse de l'élève, telle que le prof l'a entendue, les mots fautifs
// surlignés selon leur ou leurs types ; legend : la légende des couleurs
// (inutile s'il n'y a qu'un type de faute). Une nouvelle réponse s'écrit
// caractère par caractère, comme la parole du prof (cf. TeacherSpeech), puis
// ses mots fautifs sont surlignés au stabilo, l'un après l'autre (cf.
// demande explicite du user).
export function Answer({ evaluation, legend = true }) {
  if (!evaluation.answer) return <p className="muted">(pas de réponse)</p>;
  return (
    <StreamedAnswer
      key={evaluation.answer}
      evaluation={evaluation}
      legend={legend}
    />
  );
}

function StreamedAnswer({ evaluation, legend }) {
  const words = useMemo(
    () =>
      withoutNikkud(evaluation.answer)
        .split(" ")
        .map((word) => graphemes(word)),
    [evaluation.answer],
  );
  // Position du premier caractère de chaque mot (une espace avant chacun).
  const starts = words.reduce(
    (acc, word, i) => [...acc, i ? acc[i - 1] + words[i - 1].length + 1 : 0],
    [],
  );
  const total = starts[words.length - 1] + words[words.length - 1].length;
  const [shown, setShown] = useState(0);
  const done = shown >= total;

  useEffect(() => {
    if (done) return undefined;
    const timer = setTimeout(() => setShown((n) => n + 1), SPEECH_STEP_MS);
    return () => clearTimeout(timer);
  }, [shown, done]);

  const kinds = errorKinds(
    words.map((chars) => chars.join("")),
    evaluation.errors,
  );
  const present = Object.keys(ERROR_KINDS).filter((kind) =>
    kinds.some((k) => k.includes(kind)),
  );
  let strokes = 0;
  return (
    <>
      <p className="ra-answer" dir="rtl" lang="he">
        {words.map((chars, i) => {
          if (shown < starts[i]) return null;
          // Lecture : retour à la ligne entre deux phrases, comme dans le texte.
          if (chars.length === 1 && chars[0] === "\n") return <br key={i} />;
          const word = chars.slice(0, shown - starts[i]).join("");
          return (
            <span key={i}>
              {i > 0 && " "}
              {done && kinds[i].length > 0 ? (
                <ErrorWord kinds={kinds[i]} stroke={strokes++}>
                  {word}
                </ErrorWord>
              ) : (
                word
              )}
            </span>
          );
        })}
        {!done && <span className="ra-caret" aria-hidden="true" />}
      </p>
      {done && legend && present.length > 0 && (
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

// Évaluation de la réponse : le commentaire de chaque faute surlignée.
export function Evaluation({ evaluation }) {
  return (
    <>
      {evaluation.errors.length > 0 && (
        <ul className="ra-error-comments">
          {evaluation.errors.map((error, i) => (
            <li key={i}>
              {error.word && (
                <span dir="rtl" lang="he">
                  <ErrorWord kinds={[error.kind]}>
                    {withoutNikkud(error.word)}
                  </ErrorWord>
                </span>
              )}
              <span>{error.comment}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
