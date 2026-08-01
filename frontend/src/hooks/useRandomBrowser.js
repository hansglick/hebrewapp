import { useEffect, useState } from "react";

// Parcours d'objets tirés aléatoirement avec un historique de navigation :
// next() tire un nouvel objet (pousse l'objet courant dans l'historique),
// back() revient à l'objet précédemment vu (renvoie false si l'historique
// est vide, à l'appelant de décider quoi faire — ex: sortir de l'écran).
//
// fetchRandom est rappelé (et l'historique réinitialisé) à chaque changement
// d'une valeur de `deps` (ex: changement de leçon ou de mode exploration/révision).
export function useRandomBrowser(fetchRandom, deps = []) {
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    setHistory([]);
    fetchRandom().then(setCurrent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  function next() {
    setHistory((h) => (current ? [...h, current] : h));
    fetchRandom().then(setCurrent);
  }

  function back() {
    if (history.length === 0) return false;
    setCurrent(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
    return true;
  }

  return { current, setCurrent, next, back };
}
