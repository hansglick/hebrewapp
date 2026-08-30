// Code couleur partagé par les deux indicateurs de progression de l'accueil
// (leçon en cours / réviser) : <60% rouge, 60-80% jaune, >80% vert.
export function progressColor(percent) {
  if (percent > 80) return "var(--success)";
  if (percent >= 60) return "var(--warning)";
  return "var(--danger)";
}
