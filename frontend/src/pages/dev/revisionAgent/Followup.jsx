import { Fragment } from "react";

// Marques du suivi, reprises par l'évaluation de la complétion (cf. CompletionBoard).
export function CheckIcon() {
  return (
    <svg viewBox="0 0 40 40" className="ra-mark-icon" aria-hidden="true">
      <circle cx="20" cy="20" r="19" />
      <path d="M11 20.5l6 6 12-13" />
    </svg>
  );
}

export function CrossIcon() {
  return (
    <svg viewBox="0 0 40 40" className="ra-mark-icon" aria-hidden="true">
      <circle cx="20" cy="20" r="19" />
      <path d="M13 13l14 14M27 13L13 27" />
    </svg>
  );
}

// Suivi de la séance, commun à l'expression libre et à la compréhension : une
// ligne par exercice (names : type → nom ; cf. demande explicite du user),
// chacune avec son taux de réussite puis une marque par essai évalué, dans
// l'ordre, séparées d'un tiret — coche blanche sur fond bleu, croix bleue sans fond. Chaque nouvelle
// marque apparaît en explosant (une seule fois : sa key ne change plus).
export default function Followup({ history, names }) {
  if (history.length === 0) {
    return <p className="muted">Aucun exercice évalué pour l’instant.</p>;
  }
  return (
    <ul className="ra-followup">
      {Object.entries(names).map(([kind, name]) => {
        const marks = history.filter((event) => event.kind === kind);
        if (marks.length === 0) return null;
        const rate = Math.round((100 * marks.filter((m) => m.ok).length) / marks.length);
        return (
          <li key={kind}>
            <span className="ra-followup-label">
              {name} ({rate} %) :
            </span>
            {marks.map((mark, i) => (
              <Fragment key={mark.seq}>
                {i > 0 && <span className="ra-followup-dash">-</span>}
                <span
                  className={`ra-burst ra-followup-${mark.ok ? "ok" : "ko"}`}
                  title={mark.ok ? "Réussi" : "Raté"}
                >
                  {mark.ok ? <CheckIcon /> : <CrossIcon />}
                </span>
              </Fragment>
            ))}
          </li>
        );
      })}
    </ul>
  );
}
