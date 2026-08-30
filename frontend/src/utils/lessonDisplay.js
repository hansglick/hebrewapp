// Habillage purement graphique de deux codes de leçon particuliers : le code
// réel ("under the hood" — routes, clés API, comparaisons) ne change jamais,
// seul l'affichage à l'écran est concerné.
const DISPLAY_OVERRIDES = {
  "4.06": "4.06 & 07",
  "2.09": "2.09 & 10",
};

export function displayLessonCode(code) {
  return DISPLAY_OVERRIDES[code] ?? code;
}

// Même principe, mais uniquement le numéro de leçon (sans le préfixe de
// chapitre) — pour les contextes où le chapitre est déjà donné par ailleurs
// (ex: tuiles à l'intérieur d'un chapitre déjà identifié par son titre).
const NUMBER_OVERRIDES = {
  "4.06": "06 & 07",
  "2.09": "09 & 10",
};

export function displayLessonNumber(code) {
  if (NUMBER_OVERRIDES[code]) return NUMBER_OVERRIDES[code];
  const parts = code.split(".");
  return parts.length > 1 ? parts[1] : code;
}
