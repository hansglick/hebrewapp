// Réponse de l'élève et son évaluation silencieuse par le prof, communes à la
// compréhension de texte et à l'expression libre (cf.
// app.revision_agent.evaluation) : fautes surlignées et commentées, sans note
// (cf. demande explicite du user). La réponse et ses mots fautifs s'affichent
// sans nikkoud.

import { useEffect, useMemo, useState } from "react";
import { graphemes, withoutNikkud } from "./hebrew";
import { CheckIcon } from "./Followup";
import { SPEECH_STEP_MS } from "./TeacherSpeech";

// Réponse parfaite : le soulignement vert se trace, puis la coche apparaît (cf. .ra-answer-perfect).
const UNDERLINE_MS = 650;

// Plus de lettres hébraïques que latines.
const hebrewText = (text) =>
  (text.match(/[א-ת]/g) ?? []).length >= (text.match(/[a-zA-ZÀ-ÿ]/g) ?? []).length;

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

// Préposition, article ou conjonction accolés au mot (ב, ל, מ, כ, ה, ו, ש) :
// jusqu'à trois lettres devant lui.
const PREFIX = /^[בלמכהוש]{0,3}$/;

// Lettres à sauter au début du mot de la réponse (key) pour y trouver le mot
// fautif (part), une fois leurs prépositions accolées mises de côté (même
// mot, au moins deux lettres) : seule celle de la réponse est sautée, quand
// le mot fautif n'en a pas (« בבית » pour la faute « בית ») ; le mot entier
// (0) quand c'est le même mot, ou quand la faute porte sur la préposition
// (« בבית » pour « לבית ») ; -1, ce n'est pas ce mot.
function prefixed(key, part) {
  if (key === part) return 0;
  for (let k = 0; k <= 3; k += 1) {
    for (let m = 0; m <= 3; m += 1) {
      const stem = key.slice(k);
      if (stem.length >= 2 && stem === part.slice(m) && PREFIX.test(key.slice(0, k)) && PREFIX.test(part.slice(0, m))) {
        return m === 0 ? k : 0;
      }
    }
  }
  return -1;
}

// Type(s) de faute de chaque mot de la réponse (kinds) et lettres de son
// début laissées hors du surlignage (skips). Une faute peut porter sur
// plusieurs mots (« מיץ תפוזים ») : on cherche la suite de mots dans la
// réponse, sinon chacun de ses mots séparément. Un même mot fautif plusieurs
// fois (« דוד » mal lu trois fois) : chaque faute prend l'occurrence suivante,
// pas encore surlignée. Une préposition accolée au mot dans la réponse
// (« בבית » pour la faute « בית ») n'empêche pas de le trouver : seul le mot
// est surligné, sans elle (cf. demande explicite du user).
function errorKinds(words, errors) {
  const keys = words.map(normalize);
  const kinds = words.map(() => new Set());
  const skips = words.map(() => null);
  const mark = (i, kind, skip) => {
    kinds[i].add(kind);
    skips[i] = skips[i] === null ? skip : Math.min(skips[i], skip);
  };
  errors.forEach((error) => {
    const parts = error.word.split(/\s+/).map(normalize).filter(Boolean);
    if (parts.length === 0) return;
    // Seul le premier mot de la suite peut porter une préposition accolée.
    const matches = (i) =>
      parts.every((part, j) => (j ? keys[i + j] === part : prefixed(keys[i], part) >= 0));
    const free = (i) => parts.every((_, j) => !kinds[i + j].has(error.kind));
    // Le mot tel quel d'abord, avant un mot qui ne fait que s'y terminer (« ים » avant « מים »).
    const exact = (i) => matches(i) && keys[i] === parts[0];
    const found = [(i) => exact(i) && free(i), (i) => matches(i) && free(i), exact, matches]
      .map((test) => keys.findIndex((_, i) => test(i)))
      .find((i) => i >= 0);
    const start = found ?? -1;
    keys.forEach((key, i) => {
      if (start >= 0) {
        if (i >= start && i < start + parts.length) mark(i, error.kind, i === start ? prefixed(key, parts[0]) : 0);
        return;
      }
      const skip = Math.max(...parts.map((part) => prefixed(key, part)));
      if (skip >= 0) mark(i, error.kind, skip);
    });
  });
  return { kinds: kinds.map((set) => [...set]), skips: skips.map((skip) => skip ?? 0) };
}

// Position, dans les caractères du mot, de la fin de ses skip premières
// lettres hébraïques (0 : rien à sauter).
function prefixEnd(chars, skip) {
  let letters = 0;
  for (let i = 0; skip && i < chars.length; i += 1) {
    if (/[א-ת]/.test(chars[i]) && ++letters === skip) return i + 1;
  }
  return 0;
}

// Réponse de l'élève, telle que le prof l'a entendue, les mots fautifs
// surlignés selon leur ou leurs types ; legend : la légende des couleurs
// (inutile s'il n'y a qu'un type de faute). Une nouvelle réponse s'écrit
// caractère par caractère, comme la parole du prof (cf. TeacherSpeech), puis
// ses mots fautifs sont surlignés au stabilo, l'un après l'autre (cf.
// demande explicite du user).
// perfect : réponse sans faute, soulignée en vert dans son sens de lecture,
// puis cochée à sa fin, comme une marque du suivi (cf. demande explicite du
// user).
export function Answer({ evaluation, legend = true, perfect = false }) {
  if (!evaluation.answer) return <p className="muted">(pas de réponse)</p>;
  return (
    <StreamedAnswer
      key={evaluation.answer}
      evaluation={evaluation}
      legend={legend}
      perfect={perfect}
    />
  );
}

function StreamedAnswer({ evaluation, legend, perfect }) {
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
  const [marked, setMarked] = useState(false);
  useEffect(() => {
    if (!done || !perfect) return undefined;
    const timer = setTimeout(() => setMarked(true), UNDERLINE_MS);
    return () => clearTimeout(timer);
  }, [done, perfect]);
  // Une réponse en français (mode texte, cf. StudentAnswer) s'écrit de gauche à droite.
  const dir = hebrewText(evaluation.answer) ? "rtl" : "ltr";

  useEffect(() => {
    if (done) return undefined;
    const timer = setTimeout(() => setShown((n) => n + 1), SPEECH_STEP_MS);
    return () => clearTimeout(timer);
  }, [shown, done]);

  const { kinds, skips } = errorKinds(
    words.map((chars) => chars.join("")),
    evaluation.errors,
  );
  const present = Object.keys(ERROR_KINDS).filter((kind) =>
    kinds.some((k) => k.includes(kind)),
  );
  let strokes = 0;
  return (
    <>
      <p className="ra-answer" dir={dir} lang={dir === "rtl" ? "he" : "fr"}>
        <span className={done && perfect ? "ra-answer-perfect" : undefined}>
        {words.map((chars, i) => {
          if (shown < starts[i]) return null;
          // Lecture : retour à la ligne entre deux phrases, comme dans le texte.
          if (chars.length === 1 && chars[0] === "\n") return <br key={i} />;
          const word = chars.slice(0, shown - starts[i]).join("");
          return (
            <span key={i}>
              {i > 0 && " "}
              {done && kinds[i].length > 0 ? (
                <>
                  {chars.slice(0, prefixEnd(chars, skips[i])).join("")}
                  <ErrorWord kinds={kinds[i]} stroke={strokes++}>
                    {chars.slice(prefixEnd(chars, skips[i])).join("")}
                  </ErrorWord>
                </>
              ) : (
                word
              )}
            </span>
          );
        })}
        </span>
        {!done && <span className="ra-caret" aria-hidden="true" />}
        {marked && perfect && (
          <span className="ra-burst ra-followup-ok ra-perfect-mark" title="Aucune faute">
            <CheckIcon />
          </span>
        )}
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
