// Mapping champs -> affichage pour l'écran générique CuriositeScreen, un par
// type de contenu "curiosité" (proverbe/tanakh/récit/landmark/blague).
// heroFont "biblical" = police sérif biblique (Frank Ruhl Libre), "modern" =
// police hébraïque habituelle de l'app (--font-hebrew).
export const CURIOSITE_CONFIG = {
  proverb: {
    label: "Proverbe biblique",
    hasImage: false,
    heroFont: "biblical",
    heroFontScale: 0.7,
    heroField: "verset_francais",
    speakable: true,
    referenceValue: (item) => `${item.livre} - ${item.chapter_number}`,
    bullets: [
      { label: "Traduction", field: "expression" },
      { label: "Traduction littérale", field: "verset_litteral" },
      { label: "Explication", field: "explication" },
    ],
  },
  tanakh: {
    label: "Citation du Tanakh",
    hasImage: true,
    heroFont: "biblical",
    heroFontScale: 0.7,
    heroField: "verset",
    speakable: true,
    referenceValue: (item) => `${item.livre} - ${item.chapitre_number}:${item.verset_number}`,
    bullets: [
      { label: "Traduction", field: "verset_french" },
      { label: "Contexte", field: "explication_french" },
    ],
  },
  recit: {
    label: "Récit biblique",
    hasImage: true,
    heroFont: "biblical",
    heroFontScale: 0.7,
    heroField: "verset_hebreu",
    speakable: true,
    referenceValue: (item) => `${item.livre} - ${item.chapitre_number}`,
    bullets: [
      { label: "Traduction", field: "verset_francais" },
      { label: "Épisode", field: "titre" },
      { label: "Contexte", field: "contexte" },
    ],
  },
  landmark: {
    label: "Lieu à visiter",
    hasImage: true,
    heroFont: "modern",
    heroField: "landmark_hebrew",
    speakable: true,
    speakerWithHero: true,
    bullets: [
      { label: "Lieu", field: "landmark_english" },
      { label: "À savoir", field: "description" },
    ],
  },
  blague: {
    label: "Blague",
    hasImage: true,
    heroFont: "modern",
    heroFontScale: 0.7,
    heroField: "blague",
    speakable: true,
    speakerTopRight: true,
    bullets: [
      { label: "Traduction littérale", field: "litteral" },
      { label: "Explication", field: "sens" },
    ],
  },
  // expression/presse gardent leur propre écran dédié (ExpressionScreen,
  // PresseScreen) pour la navigation depuis Fun — ces entrées ne servent
  // qu'à la tuile "Curiosité" d'une leçon, qui parcourt les 7 types via
  // l'écran générique CuriositeScreen.
  expression: {
    label: "Expression",
    hasImage: true,
    heroFont: "modern",
    heroField: "hebreu_sans_nikud",
    speakable: true,
    speakerTopRight: true,
    bullets: [
      { label: "Traduction littérale", field: "translitteration" },
      { label: "Traduction idiomatique", field: "traduction" },
      { label: "Contexte", field: "contexte" },
    ],
  },
  presse: {
    label: "Une de presse",
    hasImage: true,
    heroFont: "modern",
    heroField: "title_hebrew",
    speakable: true,
    speakerTopRight: true,
    speakText: (item) => `${item.title_hebrew}. ${item.chapeau_hebrew}`,
    bullets: [
      { label: "Titre", field: "title_french", emphasis: true },
      { label: "Chapeau", field: "chapeau_french", emphasis: true },
    ],
  },
  // Même format d'affichage que "proverb" (pas d'image, police biblique,
  // pas de referenceValue — ces mots n'ont pas de livre/chapitre d'origine).
  hebreworiginword: {
    label: "Mot d'origine hébraïque",
    hasImage: false,
    heroFont: "biblical",
    heroField: "hebrew_word",
    speakable: true,
    speakerTopRight: true,
    bullets: [
      { label: "Mot français dérivé", field: "french_word" },
      { label: "Explication", field: "explication" },
    ],
  },
};
