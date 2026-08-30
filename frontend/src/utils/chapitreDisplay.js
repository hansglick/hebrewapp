// Habillage purement graphique du numéro de chapitre : le code réel ("under
// the hood" — routes, clés API, comparaisons) ne change jamais, seul
// l'affichage à l'écran est concerné.
const CHAPTER_LABELS = {
  "0": "גור",
  "1": "תלמיד",
  "2": "בחור",
  "3": "ותיק",
  "4": "צבר",
};

// Logos fournis par l'utilisateur dans backend/results/logos/, un par
// chapitre — servis via /media (cf. api/media.js::mediaUrl).
const CHAPTER_LOGO_FILES = {
  "0": "cub.svg",
  "1": "talmid.svg",
  "2": "bachour.svg",
  "3": "veteran.svg",
  "4": "israeli.svg",
};

export function displayChapitreLabel(chapId) {
  return CHAPTER_LABELS[String(chapId)] ?? `Chapitre ${chapId}`;
}

export function chapitreLogoFile(chapId) {
  return CHAPTER_LOGO_FILES[String(chapId)] ?? null;
}
