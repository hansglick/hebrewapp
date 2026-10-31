import { useEffect, useState } from "react";

// Intitulé qui change comme le tableau des départs d'une gare (cf. demande
// explicite du user), dans la police des autres intitulés (cf. .ra-label) :
// quand le texte change, chaque lettre bascule plusieurs fois, sur des lettres
// au hasard, avant de se poser sur la nouvelle, un peu après sa voisine de
// gauche.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZÉ";
const CELLS = 12; // « CONVERSATION », le plus long des intitulés
const FLAP_MS = 55; // une bascule (cf. @keyframes ra-flap-flip)
const STAGGER = 1; // bascules d'avance de chaque lettre sur sa voisine de droite
const FLIPS = 4; // bascules au hasard avant la bonne lettre (plus une selon la place)

const cells = (text) => text.toUpperCase().padEnd(CELLS).slice(0, CELLS).split("");
const randomLetter = () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)];

export default function FlapLabel({ text }) {
  const [shown, setShown] = useState(() => cells(text));

  useEffect(() => {
    const target = cells(text);
    const last = (CELLS - 1) * STAGGER + FLIPS + 3;
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
      setShown((previous) =>
        previous.map((letter, i) => {
          const start = i * STAGGER;
          if (ticks <= start || letter === target[i]) return letter;
          // Une case vide qui le reste ne bascule pas ; les autres passent par quelques lettres.
          if (letter === " " && target[i] === " ") return letter;
          return ticks >= start + FLIPS + (i % 3) ? target[i] : randomLetter();
        }),
      );
      if (ticks >= last) clearInterval(timer);
    }, FLAP_MS);
    return () => clearInterval(timer);
  }, [text]);

  return (
    <span className="ra-label ra-flap" role="heading" aria-level={2} aria-label={text}>
      {shown.map((letter, i) => (
        <span key={i} className="ra-flap-cell" aria-hidden="true">
          {/* Une nouvelle lettre : elle bascule en place. */}
          <span key={letter} className="ra-flap-letter">
            {letter}
          </span>
        </span>
      ))}
    </span>
  );
}
