// Fichier de configuration graphique — modifiable à la main sans repasser par du code applicatif.
//
// Deux couches (cf. demande explicite du user) :
// - `basePaletteLight`/`basePaletteDark` : les couleurs "brutes" du skin actif
//   — la SEULE chose à changer pour créer un nouveau skin. Absolument tout
//   vient de cette palette : aucune couleur fixe en dehors (à l'exception
//   des divertissements — confettis, pièces d'or, cabinet des cartes —
//   volontairement indépendants, cf. demande explicite du user).
// - `buildTheme()` construit les tokens ("theme", ci-dessous) à partir de
//   cette palette : c'est la correspondance rôle -> couleur de base, qui,
//   elle, ne change PAS d'un skin à l'autre. Le code applicatif ne référence
//   jamais directement une couleur de la palette, toujours un token
//   (`var(--accent)`, etc.).
//
// Restructuration complète (cf. demande explicite du user, "21 clusters") :
// chaque élément visuel identifié par le user avait initialement SON PROPRE
// champ de palette, même quand plusieurs partageaient la même valeur. Une
// passe de fusion (cf. demande explicite du user) a ensuite regroupé les
// clusters dont les couleurs étaient identiques dans les DEUX thèmes (pas
// seulement en clair — un cluster valant la même chose en clair mais PAS en
// sombre reste séparé, cf. binyanim/keyBg/inputBg) :
// - `racineShin` + `contentToggleKnob` -> fondus dans `accent`
// - `micIdle` -> fondu dans `validationPleine`
// - `micRecording` -> fondu dans `annulationPleine`
// - `lectureGrisee` + `traitColor` -> fondus dans `cardBorder`
// - `chromeToggleKnob` -> fondu dans `chromeTextPrimary`
// - `contentToggleTrack` -> fondu dans `bg`

const basePaletteLight = {
  // 1/2 — mots de l'écran principal (principal / secondaire).
  textPrimary: "#1a1a1a",
  textSecondary: "#6b6375",
  // 3/4 — mots des barres de contrôle (principal / secondaire). Sert aussi
  // de curseur au toggle "bandeau/panneau mobile/bottom-nav" (fusionné).
  chromeTextPrimary: "#f3f4f6",
  chromeTextSecondary: "#9ca3af",
  // 5/6 — backgrounds. `bg` sert aussi de piste au toggle "en contenu"
  // (Clavier hébreu, Pré-remplir, God Mode — fusionné).
  bg: "#ffffff",
  chromeBg: "#16171d",
  // 7 — logo haut-parleur (gris orphelin, ne suit jamais le thème).
  speakerIcon: "#64748b",
  // 8 — logos shekel/gems.../magen david/configuration/bordure/previous/house/next.
  // Bleu électrique se rapprochant du bleu de l'emoji 💎, cf. demande
  // explicite du user (remplace l'ancien bleu nuit #1d3557).
  logoAccent: "#0ea5e9",
  // 9 — couleur d'accent générale : lettre "ש" (racine), boutons "speak-btn"
  // divers, onde de lecture remplie, curseur du toggle "en contenu" (les 3
  // derniers fusionnés ici, valeur identique dans les deux thèmes).
  accent: "#2f6f4f",
  // 10 — les 7 couleurs des binyanim (identité fixe, ne suit pas le thème).
  binyanPaal: "#8b5cf6",
  binyanNifal: "#22b8cf",
  binyanPiel: "#f08c00",
  binyanPual: "#a15c33",
  binyanHifil: "#e03131",
  binyanHufal: "#e64980",
  binyanHitpael: "#2f9e44",
  // 11/12 — validation. `validationPleine` sert aussi au micro au repos
  // (fusionné, JdrScreen/RevisionScreen).
  validationGrisee: "#b2f2bb",
  validationPleine: "#2f9e44",
  // 13/14 — annulation. `annulationPleine` sert aussi au micro en cours
  // d'enregistrement (fusionné, OralAnswerCapture/VoicePrefill/JdrScreen/
  // RevisionScreen).
  annulationGrisee: "#ffc9c9",
  annulationPleine: "#e03131",
  // 15/16 — encadrés (cartes, listes de tuiles, ET LabeledTile). `cardBorder`
  // sert aussi à l'onde "pas encore lue" et aux traits horizontaux/verticaux
  // (fusionnés, valeur identique dans les deux thèmes).
  cardBg: "#f4f3ec",
  cardBorder: "#e5e4e7",
  // 18 — lecture + minituile + bordure (bleu nuit, identité fixe).
  tileAccent: "#1e3a5f",
  // 20 — les 3 toggles distincts (thème clair/sombre — piste + curseur
  // propres ; bandeau/panneau mobile/bottom-nav — piste propre, curseur
  // fusionné dans chromeTextPrimary ; en contenu — piste fusionnée dans bg,
  // curseur fusionné dans accent).
  themeToggleTrack: "#999999",
  themeToggleKnob: "#a9d6f5",
  chromeToggleTrack: "#4b4d57",
  // Hors périmètre des 21 clusters (inchangés) :
  warning: "#f08c00",
  keyBg: "#ffffff",
  keyText: "#000000",
  inputBg: "#ffffff",
  chromePanelBorder: "#2e303a",
  chromeDivider: "#4b5563",
  chromeDanger: "#ff6b6b",
};

const basePaletteDark = {
  textPrimary: "#f3f4f6",
  textSecondary: "#9ca3af",
  chromeTextPrimary: "#f3f4f6",
  chromeTextSecondary: "#9ca3af",
  bg: "#16171d",
  chromeBg: "#16171d",
  speakerIcon: "#64748b",
  logoAccent: "#38bdf8",
  accent: "#5fbf8b",
  binyanPaal: "#8b5cf6",
  binyanNifal: "#22b8cf",
  binyanPiel: "#f08c00",
  binyanPual: "#a15c33",
  binyanHifil: "#e03131",
  binyanHufal: "#e64980",
  binyanHitpael: "#2f9e44",
  validationGrisee: "#69db7c",
  validationPleine: "#40c057",
  annulationGrisee: "#ffa8a8",
  annulationPleine: "#ff6b6b",
  cardBg: "#1f2028",
  cardBorder: "#2e303a",
  tileAccent: "#1e3a5f",
  themeToggleTrack: "#999999",
  themeToggleKnob: "#a9d6f5",
  chromeToggleTrack: "#4b4d57",
  warning: "#ffa94d",
  keyBg: "#000000",
  keyText: "#ffffff",
  inputBg: "#1f2028",
  chromePanelBorder: "#2e303a",
  chromeDivider: "#4b5563",
  chromeDanger: "#ff6b6b",
};

function buildTheme(p) {
  return {
    textPrimary: p.textPrimary,
    textSecondary: p.textSecondary,
    chromeTextPrimary: p.chromeTextPrimary,
    chromeTextSecondary: p.chromeTextSecondary,
    bg: p.bg,
    chromeBg: p.chromeBg,
    speakerIcon: p.speakerIcon,
    logoAccent: p.logoAccent,
    accent: p.accent,
    binyanPaal: p.binyanPaal,
    binyanNifal: p.binyanNifal,
    binyanPiel: p.binyanPiel,
    binyanPual: p.binyanPual,
    binyanHifil: p.binyanHifil,
    binyanHufal: p.binyanHufal,
    binyanHitpael: p.binyanHitpael,
    validationGrisee: p.validationGrisee,
    validationPleine: p.validationPleine,
    annulationGrisee: p.annulationGrisee,
    annulationPleine: p.annulationPleine,
    cardBg: p.cardBg,
    cardBorder: p.cardBorder,
    tileAccent: p.tileAccent,
    themeToggleTrack: p.themeToggleTrack,
    themeToggleKnob: p.themeToggleKnob,
    chromeToggleTrack: p.chromeToggleTrack,
    warning: p.warning,
    keyBg: p.keyBg,
    keyText: p.keyText,
    inputBg: p.inputBg,
    chromePanelBorder: p.chromePanelBorder,
    chromeDivider: p.chromeDivider,
    chromeDanger: p.chromeDanger,
  };
}

export const appConfig = {
  theme: {
    light: buildTheme(basePaletteLight),
    dark: buildTheme(basePaletteDark),
  },
  fontFamily: {
    latin: "system-ui, 'Segoe UI', Roboto, sans-serif",
    hebrew: "'Arial Hebrew', 'Noto Sans Hebrew', system-ui, sans-serif",
    hebrewBiblical: "'Frank Ruhl Libre', 'Times New Roman', serif",
  },
  fontSize: {
    small: 14,
    medium: 18,
    large: 24,
    hebrewLarge: 34,
  },
};

// Correspondance binyan -> token de couleur (cluster 10) — le champ
// `binyan_color`/`color` renvoyé par l'API (noms CSS bruts type "purple")
// n'est plus utilisé côté frontend, remplacé par cette table pilotée par
// la palette. Clé = nom hébreu du binyan, tel que renvoyé par l'API
// (`verbe.binyan` / `binyan.name`).
export const BINYAN_COLORS = {
  "פעל": "var(--binyanPaal)",
  "נפעל": "var(--binyanNifal)",
  "פיעל": "var(--binyanPiel)",
  "פועל": "var(--binyanPual)",
  "הפעיל": "var(--binyanHifil)",
  "הופעל": "var(--binyanHufal)",
  "התפעל": "var(--binyanHitpael)",
};
