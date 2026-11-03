// Lecture avec la transcription en direct (cf. StudentAnswer) : jugé une
// lecture, le verbatim de l'élève se nettoie en la phrase à lire, comme le
// titre de la fenêtre change (cf. FlapLabel, demande explicite du user). Les
// mots justes restent ; les autres basculent lettre par lettre, sur des
// lettres au hasard, avant de se poser sur le mot du texte ; un mot en trop
// bascule sur des cases vides, un mot manquant apparaît. Puis onDone, et la
// phrase à lire prend la suite (cf. Answer).

import { useEffect, useMemo, useRef, useState } from "react";
import { withoutNikkud } from "./hebrew";

const ALPHABET = "אבגדהוזחטיכלמנסעפצקרשת";
const FLAP_MS = 55; // une bascule (cf. @keyframes ra-flap-flip)
const STAGGER = 1; // bascules d'avance de chaque lettre sur la suivante, dans un mot
const FLIPS = 4; // bascules au hasard avant la bonne lettre (plus une selon la place)

// Deux mots sont les mêmes sans ponctuation ni voyelles.
const key = (word) => word.replace(/[^א-ת]/g, "");

// Les mots du verbatim (from) et de la phrase à lire (to), alignés (plus longue sous-suite commune) : {from, to},
// un mot gardé (from = to, le mot du texte), remplacé, en trop (to vide) ou manquant (from vide). Les retours à la
// ligne du texte (« \n », cf. readingText) restent.
function aligned(from, to) {
  const said = withoutNikkud(from).split(/\s+/).filter(Boolean);
  const target = withoutNikkud(to).split(" ").filter(Boolean);
  const same = (i, j) => target[j] !== "\n" && key(said[i]) !== "" && key(said[i]) === key(target[j]);
  const lcs = Array.from({ length: said.length + 1 }, () => new Array(target.length + 1).fill(0));
  for (let i = said.length - 1; i >= 0; i--)
    for (let j = target.length - 1; j >= 0; j--)
      lcs[i][j] = same(i, j) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const words = [];
  let dropped = [];
  let added = [];
  // Entre deux mots gardés, les mots en trop et les manquants, deux à deux : un mot remplacé.
  const flush = () => {
    for (let k = 0; k < Math.max(dropped.length, added.length); k++)
      words.push({ from: dropped[k] ?? "", to: added[k] ?? "" });
    dropped = [];
    added = [];
  };
  let i = 0;
  let j = 0;
  while (i < said.length || j < target.length) {
    if (i < said.length && j < target.length && same(i, j)) {
      flush();
      words.push({ from: target[j], to: target[j] });
      i++;
      j++;
    } else if (j < target.length && target[j] === "\n") {
      flush();
      words.push({ from: "\n", to: "\n" });
      j++;
    } else if (i < said.length && (j >= target.length || lcs[i + 1][j] >= lcs[i][j + 1])) {
      dropped.push(said[i++]);
    } else {
      added.push(target[j++]);
    }
  }
  flush();
  return words;
}

// Les cases d'un mot : autant que de lettres dans le plus long des deux.
const cells = (word, size) => [...word].concat(Array(size - [...word].length).fill(" "));

export default function CleanReading({ from, to, onDone }) {
  const words = useMemo(
    () =>
      aligned(from, to).map((word) => {
        const size = Math.max([...word.from].length, [...word.to].length);
        return { ...word, start: cells(word.from, size), end: cells(word.to, size) };
      }),
    [from, to],
  );
  const [shown, setShown] = useState(() => words.map((word) => word.start));
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    const longest = Math.max(1, ...words.map((word) => word.end.length));
    const last = (longest - 1) * STAGGER + FLIPS + 3;
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
      setShown((previous) =>
        previous.map((letters, w) =>
          letters.map((letter, i) => {
            const target = words[w].end[i];
            const start = i * STAGGER;
            if (ticks <= start || letter === target) return letter;
            return ticks >= start + FLIPS + (i % 3) ? target : ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
          }),
        ),
      );
      if (ticks >= last) {
        clearInterval(timer);
        done.current();
      }
    }, FLAP_MS);
    return () => clearInterval(timer);
  }, [words]);

  return (
    <p className="ra-answer ra-answer-cleaning" dir="rtl" lang="he" aria-label={withoutNikkud(to)}>
      {words.map((word, w) =>
        word.to === "\n" ? (
          <br key={w} />
        ) : (
          <span key={w} aria-hidden="true">
            {w > 0 && " "}
            <span className="ra-clean-word">
              {shown[w].map((letter, i) => (
                <span key={i} className="ra-flap-cell">
                  {/* Une nouvelle lettre : elle bascule en place (cf. .ra-flap-letter). */}
                  <span key={letter} className="ra-flap-letter">
                    {letter}
                  </span>
                </span>
              ))}
            </span>
          </span>
        ),
      )}
    </p>
  );
}
