// Phrase découpée en morceaux, les positions spans ([début, fin], triées)
// surlignées — phrase d'origine de la complétion et de la tâche « Mot ».
export default function highlighted(sentence, spans) {
  const parts = [];
  let at = 0;
  spans.forEach(([start, end], i) => {
    if (start > at) parts.push(sentence.slice(at, start));
    parts.push(
      <mark key={i} className="ra-target">
        {sentence.slice(Math.max(start, at), end)}
      </mark>,
    );
    at = Math.max(at, end);
  });
  parts.push(sentence.slice(at));
  return parts;
}
