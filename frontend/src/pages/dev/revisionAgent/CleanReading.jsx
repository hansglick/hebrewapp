// Lecture avec la transcription en direct (cf. StudentAnswer) : jugé une
// lecture, le verbatim de l'élève se nettoie en la phrase à lire (cf.
// demande explicite du user). Ses mots absents du texte s'effacent, ceux qui
// manquent apparaissent à leur place, les autres restent ; puis onDone, et la
// phrase à lire prend la suite, telle qu'elle est ici à la fin (cf. Answer).

import { useEffect, useMemo, useRef } from "react";
import { withoutNikkud } from "./hebrew";

// Effacement, puis apparition (cf. .ra-clean-drop, .ra-clean-add).
export const CLEAN_MS = 750;

// Deux mots sont les mêmes sans ponctuation ni voyelles.
const key = (word) => word.replace(/[^א-ת]/g, "");

// Les mots du verbatim (from) et de la phrase à lire (to), alignés (plus longue sous-suite commune) : {text, kind},
// kind : keep (le mot du texte, gardé), drop (absent du texte, effacé), add (manquant, ajouté). Les retours à la
// ligne du texte (« \n », cf. readingText) restent.
function aligned(from, to) {
  const said = withoutNikkud(from).split(/\s+/).filter(Boolean);
  const target = withoutNikkud(to).split(" ").filter(Boolean);
  const same = (i, j) => target[j] !== "\n" && key(said[i]) !== "" && key(said[i]) === key(target[j]);
  const lcs = Array.from({ length: said.length + 1 }, () => new Array(target.length + 1).fill(0));
  for (let i = said.length - 1; i >= 0; i--)
    for (let j = target.length - 1; j >= 0; j--)
      lcs[i][j] = same(i, j) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const tokens = [];
  let i = 0;
  let j = 0;
  while (i < said.length || j < target.length) {
    if (i < said.length && j < target.length && same(i, j)) {
      tokens.push({ text: target[j++], kind: "keep" });
      i++;
    } else if (j < target.length && target[j] === "\n") {
      tokens.push({ text: target[j++], kind: "keep" });
    } else if (i < said.length && (j >= target.length || lcs[i + 1][j] >= lcs[i][j + 1])) {
      tokens.push({ text: said[i++], kind: "drop" });
    } else {
      tokens.push({ text: target[j++], kind: "add" });
    }
  }
  return tokens;
}

export default function CleanReading({ from, to, onDone }) {
  const tokens = useMemo(() => aligned(from, to), [from, to]);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const timer = setTimeout(() => done.current(), CLEAN_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <p className="ra-answer ra-answer-cleaning" dir="rtl" lang="he">
      {tokens.map((token, i) =>
        token.text === "\n" ? (
          <br key={i} />
        ) : (
          <span key={i} className={`ra-clean-${token.kind}`}>
            {token.text}
          </span>
        ),
      )}
    </p>
  );
}
