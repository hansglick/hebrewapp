import { progressColor } from "./progressColor";

// Message + couleur pour l'indicateur de readiness examen ("Réviser"),
// réutilisé par Accueil et RevisionsChoiceScreen.
export function readinessDisplay(readiness) {
  if (!readiness) return null;
  if (readiness.status === "not_ready") {
    return {
      percent: (100 * readiness.count) / readiness.target,
      color: "var(--textMuted)",
      message: "Tu n'as pas encore suffisamment révisé",
    };
  }
  const percent = readiness.performance * 100;
  return {
    percent,
    color: progressColor(percent),
    message: readiness.ready
      ? "Tu es fin prêt à passer l'examen, Fonce!"
      : "Ta performance pendant tes révisions est médiocre, continue tu dois dépasser les 70%",
  };
}
