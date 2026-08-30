import { useEffect, useRef, useState } from "react";

function depsEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((v, i) => Object.is(v, b[i]));
}

// Parcours d'objets tirés aléatoirement avec un historique de navigation :
// next() tire un nouvel objet (pousse l'objet courant dans l'historique),
// back() revient à l'objet précédemment vu (renvoie false si l'historique
// est vide, à l'appelant de décider quoi faire — ex: sortir de l'écran).
//
// fetchRandom est rappelé (et l'historique réinitialisé) à chaque changement
// d'une valeur de `deps` (ex: changement de leçon ou de mode exploration/révision).
//
// `initialCurrent`, si fourni (ex: restauré via location.state après un
// aller-retour vers un écran annexe qui a démonté ce composant), pré-remplit
// `current` et saute le tirage aléatoire tant que `deps` ne change pas —
// sans quoi celui-ci écraserait la restauration. La comparaison se fait par
// valeur (pas par un simple flag "consommé une fois") pour rester correcte
// sous StrictMode, qui rejoue l'effet une seconde fois au montage en dev.
export function useRandomBrowser(fetchRandom, deps = [], initialCurrent) {
  const [current, setCurrent] = useState(initialCurrent ?? null);
  const [history, setHistory] = useState([]);
  const skipDepsRef = useRef(initialCurrent !== undefined ? deps : null);

  useEffect(() => {
    if (skipDepsRef.current !== null && depsEqual(skipDepsRef.current, deps)) {
      return;
    }
    skipDepsRef.current = null;
    setHistory([]);
    fetchRandom().then(setCurrent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  function next() {
    setHistory((h) => (current ? [...h, current] : h));
    fetchRandom(current).then(setCurrent);
  }

  function back() {
    if (history.length === 0) return false;
    setCurrent(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
    return true;
  }

  return { current, setCurrent, next, back };
}
