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
  // 7 — logo haut-parleur (noir fixe, ne suit jamais le thème — cf.
  // demande explicite du user).
  speakerIcon: "#000000",
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
  // Fond/chiffre des pastilles d'étape (StepBadge), nuance des titres
  // d'énoncé "soft" (SectionTitle) et fond du bouton spécial (Hard Exam) —
  // jusqu'ici codés en dur dans chaque écran plutôt que pilotés par la
  // palette ; tokenisés pour que la palette V2 éditable (cf.
  // computePaletteV2 plus bas) puisse les changer. Valeurs inchangées ici
  // (identiques aux anciens littéraux).
  stepBadgeBlueBg: "#dbeafe",
  stepBadgeBlueFg: "#1d4ed8",
  stepBadgeOrangeBg: "#ffedd5",
  stepBadgeOrangeFg: "#c2410c",
  enonceSoft: "#9ca3af",
  examSpecialBg: "#f97316",
  // Fond/bordure de la tuile "Examen" (.card-dark, écran d'accueil) —
  // jusqu'ici codé en dur (#000), raccordé en V2 directement à la base
  // "Vert5" (cf. demande explicite du user — remplace la dérivée foncée
  // de Vert5, elle-même remplaçant le raccordement direct au "Noir"
  // décidés précédemment). Valeur inchangée ici.
  tuileAlertBg: "#000000",
  // Fond du panneau lecteur audio (questions orales) — jusqu'ici codé en
  // dur (#fff), raccordé à la base "Blanc" (cf. demande explicite du
  // user). Valeur inchangée ici.
  audioPanelBg: "#ffffff",
  // Traits horizontaux (<hr>, ~21 écrans), piste de la barre de lecture
  // (AudioPlayer, écran leçon/texte) et pastille de vitesse
  // (AudioTrackFooter) — partageaient jusqu'ici `cardBorder`, découplés
  // ici pour pouvoir les raccorder à la base "Gris1" en V2 sans toucher
  // aux bordures de tuiles/encadrés (cf. demande explicite du user).
  // Valeur inchangée ici (identique à l'ancien cardBorder).
  dividerColor: "#e5e4e7",
  // Fond/triangle du bouton lecture (AudioPlayer, écran leçon/texte) —
  // jusqu'ici var(--speakerIcon)/blanc en dur, découplés pour les
  // raccorder aux bases "Vert5"/"Gris1" en V2 sans toucher aux icônes
  // haut-parleur ailleurs dans l'app (cf. demande explicite du user).
  // Valeurs inchangées ici.
  audioToggleBg: "#000000",
  audioToggleFg: "#ffffff",
  // Sélection HE/FR (radio) de l'écran leçon/texte — jusqu'ici
  // var(--speakerIcon) en dur, découplée pour la raccorder à la base
  // "Vert5" en V2 sans toucher au même toggle sur l'écran Dictionnaire
  // (cf. demande explicite du user). Valeur inchangée ici.
  texteRadioAccent: "#000000",
  // Logo haut-parleur de l'écran Apprendre/Traductions (QuestionEcriteScreen)
  // — jusqu'ici var(--speakerIcon) partagé (noir fixe, jamais lié au thème
  // ni à la palette), découplé pour le raccorder à la base "Noir" en V2
  // sans toucher aux autres logos haut-parleur de l'app (Mot, Verbe,
  // Dictionnaire, curiosités...) — cf. demande explicite du user. Valeur
  // inchangée ici.
  traductionsSpeakerIcon: "#000000",
  // Barre de citation verticale (QuoteBlock) — jusqu'ici var(--tileAccent)
  // partagé (avec le bouton lecture des questions orales, les titres
  // "Contenu"/"Question" et la bordure de la mini-tuile "Réponse"),
  // découplée pour la raccorder à une dérivée foncée de la base "Rouge7"
  // en V2 sans toucher aux autres usages de tileAccent — cf. demande
  // explicite du user. Valeur inchangée ici (identique à l'ancien
  // tileAccent).
  citationBarColor: "#1e3a5f",
  examToggleTrack: "#4b4d57",
  // Pastille "1" ("Traduis" et équivalents) : examen blanc, examen écrit,
  // révisions (QuizzScreen), leçon/mot (MotScreen) et leçon/verbe
  // (VerbeScreen) — jusqu'ici stepBadgeBlueBg/Fg partagés avec tous les
  // autres badges "1" de l'app (onboarding, dev preview...), découplés en
  // V2 : fond ET bordure = "Bg 2" ; chiffre = "Color 2" direct en clair,
  // une dérivée claire de "Color 2" en sombre (Bg 1 sombre) — cf. demande
  // explicite du user. Valeurs inchangées ici (identiques aux anciens
  // littéraux).
  examTraduisBadgeBg: "#dbeafe",
  examTraduisBadgeFg: "#1d4ed8",
  // Bordure de la pastille "1" — jusqu'ici confondue avec la couleur du
  // chiffre (examTraduisBadgeFg), découplée pour la raccorder à "Bg 2" en
  // V2 sans dépendre du thème — cf. demande explicite du user. Valeur
  // inchangée ici (identique à l'ancien examTraduisBadgeFg).
  examTraduisBadgeBorder: "#1d4ed8",
  // Titre des pastilles "1" (partagé avec "Ecoute le contenu"/"Ecoute la
  // question", compréhension orale) — TOUJOURS une dérivée claire de
  // "Color 2", clair ET sombre (contrairement au fond/à la bordure, qui
  // restent fixes en clair) — cf. demande explicite du user. Valeur
  // inchangée ici.
  color2TitleColor: "#9ca3af",
  // Titre des pastilles "2" ("Réponse" et équivalents, partout où elles
  // apparaissent) — TOUJOURS une dérivée claire de "Color 1", clair ET
  // sombre — cf. demande explicite du user. Valeur inchangée ici.
  color1TitleColor: "#9ca3af",
  // Trait vertical fin entre "temps" et "personne" (écran leçon/révisions
  // verbe, VerbeScreen) — jusqu'ici var(--cardBorder) partagé avec toutes
  // les bordures d'encadrés, découplé pour le raccorder à "Bg 2" en V2
  // sans toucher aux autres bordures — cf. demande explicite du user.
  // Valeur inchangée ici (identique à l'ancien cardBorder).
  verbeVerticalDivider: "#e5e4e7",
  // Police de la bulle sélectionnée au 1er tap (Quizz/révisions, cf.
  // .quizz-bubble.selected) — jusqu'ici var(--textPrimary) partagé,
  // découplée pour la raccorder à "Color 1" en V2 UNIQUEMENT quand le
  // thème est sombre (Bg 1 sombre) ; reste identique à textPrimary en
  // clair — cf. demande explicite du user. Valeur inchangée ici.
  quizzSelectedBubbleFg: "#1a1a1a",
  // Texte des toggles de la barre de contrôle inférieure (FR/HE,
  // Auto/Teacher, cf. .bottom-nav-toggle-label) — jusqu'ici
  // var(--chromeTextSecondary) partagé, découplé pour le raccorder à
  // "Bg 1" en V2 UNIQUEMENT quand le thème est sombre ; reste identique à
  // chromeTextSecondary en clair — cf. demande explicite du user. Valeur
  // inchangée ici.
  bottomNavToggleLabelColor: "#9ca3af",
  // Fond de l'étoile dorée (badge coin haut-droit de la tuile "Parler",
  // écran d'accueil) — jusqu'ici littéral SVG fixe (#ffd700), tokenisé
  // pour le raccorder à la base "Rouge7" en V2 — cf. demande explicite du
  // user. Valeur inchangée ici.
  accueilStarBg: "#ffd700",
  // Logo de chapitre accolé à "Tu es à la leçon..." (écran d'accueil)
  // UNIQUEMENT — jusqu'ici var(--textPrimary) (trait) et transparent
  // (fond, cf. ChapitreLogo::cleanChapitreSvg), découplés pour raccorder
  // le trait ("bordure") à "Bg 1" et le fond à "Control 1" en V2 sans
  // toucher aux autres usages de ChapitreLogo — cf. demande explicite du
  // user. Valeurs inchangées ici : la bordure reprend le littéral actuel
  // de textPrimary, le fond reste transparent ("none", pas de fond en V1).
  accueilLeconLogoBorder: "#1a1a1a",
  accueilLeconLogoBg: "none",
  // Bordure de l'image (écran Apprendre/Texte) — jusqu'ici var(--cardBorder)
  // partagé avec toutes les bordures d'encadrés, découplée pour la
  // raccorder à la base "Blanc" en V2 sans toucher aux autres bordures —
  // cf. demande explicite du user. Valeur inchangée ici (identique à
  // l'ancien cardBorder).
  texteImageBorder: "#e5e4e7",
  // Fond/police de la pastille de vitesse de lecture (AudioTrackFooter,
  // partagée par AudioPlayer et AudioProgressBlock) — jusqu'ici
  // dividerColor/textSecondary partagés (l'un avec les traits/la barre de
  // lecture, l'autre avec tout le texte secondaire de l'app), découplés
  // pour les raccorder directement à "Bg 1" (fond, même couleur que le
  // fond principal de l'écran) et à "Color 1" (police) en V2 sans toucher
  // aux autres usages — cf. demande explicite du user. Valeurs inchangées
  // ici (identiques aux anciens dividerColor/textSecondary).
  speedPillBg: "#e5e4e7",
  speedPillFg: "#6b6375",
  // Chiffres du minuteur ("0:00 / 2:34", AudioTrackFooter, même écran) —
  // jusqu'ici var(--textSecondary) partagé, découplés pour les raccorder à
  // la base "Vert5" en V2 (même traitement que la police de la pastille de
  // vitesse) sans toucher au texte secondaire ailleurs dans l'app — cf.
  // demande explicite du user. Valeur inchangée ici.
  timerFg: "#6b6375",
  // Fond des pastilles 1 et 2 des blocs audio (mêmes 3 blocs) — jusqu'ici
  // var(--stepBadgeBlueBg) partagé, découplé pour le raccorder à une
  // dérivée pastel de la base "Rouge7" ("Color 2") en V2 sans toucher aux
  // autres pastilles bleues de l'app — cf. demande explicite du user.
  // Valeur inchangée ici. La pastille 3 (validationGrisee) n'est pas
  // concernée (non mentionnée par le user).
  audioBlockBadgeBg: "#dbeafe",
  // Icônes lecture/pause des 3 blocs audio (.audio-progress-block-icon,
  // partagée par AudioProgressBlock et le bloc "Réponse" d'OralAnswerCapture)
  // — jusqu'ici var(--tileAccent), découplée pour la raccorder à une
  // dérivée foncée de la base "Gris5" en V2 (blocs 1 et 2 uniquement — cf.
  // audioBlockIconColorLast pour le 3e bloc) sans toucher aux autres
  // usages de tileAccent — cf. demande explicite du user. Valeur
  // inchangée ici.
  audioBlockIconColor: "#1e3a5f",
  // Police (chiffres) des pastilles 1 et 2 des blocs audio — jusqu'ici
  // var(--stepBadgeBlueFg) partagé, découplée pour la raccorder
  // directement à la base "Rouge7" ("Color 2") en V2 sans toucher aux
  // autres pastilles bleues de l'app — cf. demande explicite du user.
  // Valeur inchangée ici.
  audioBlockBadgeFg: "#1d4ed8",
  // Bordure des pastilles 1/2 des blocs audio — jusqu'ici confondue avec
  // la couleur du chiffre (audioBlockBadgeFg), découplée pour la
  // raccorder à "Bg 2" en V2 sans dépendre du thème — cf. demande
  // explicite du user. Valeur inchangée ici (identique à l'ancien
  // audioBlockBadgeFg).
  audioBlockBadgeBorder: "#1d4ed8",
  // Icône lecture/pause du 3e bloc audio ("Réponse") uniquement — jusqu'ici
  // var(--audioBlockIconColor) partagé avec les 2 autres blocs (Contenu/
  // Question), découplée pour la raccorder à une dérivée foncée de la
  // base "Vert5" ("Color 1") en V2, différente de celle des 2 premiers
  // blocs (Gris5) — cf. demande explicite du user. Valeur inchangée ici.
  audioBlockIconColorLast: "#1e3a5f",
  // Titre "Question [x]" (écran QuestionOraleScreen) — jusqu'ici
  // var(--tileAccent), découplé pour le raccorder à la base "Noir"
  // ("Control 1") en V2 sans toucher aux autres usages de tileAccent —
  // cf. demande explicite du user. Valeur inchangée ici.
  questionOraleTitleColor: "#1e3a5f",
  // Police de l'horodatage et de la pastille de vitesse de lecture des
  // blocs audio 1 et 2 (Contenu/Question, AudioProgressBlock) — jusqu'ici
  // timerFg/speedPillFg partagés (avec AudioPlayer leçon/texte, VoicePrefill,
  // le bloc 3 "Réponse" en enregistrement), découplées pour les raccorder
  // à une dérivée foncée de la base "Gris5" en V2 sans toucher aux autres
  // usages — cf. demande explicite du user. Valeurs inchangées ici.
  audioBlockTimerColor: "#6b6375",
  audioBlockSpeedFg: "#6b6375",
  // Trait séparateur entre les 3 blocs audio (OralAnswerCapture,
  // .oral-answer-capture-divider) — jusqu'ici var(--cardBorder) partagé
  // avec toutes les bordures d'encadrés, découplé pour le raccorder à
  // "Bg 2" en V2 (même couleur que les autres traits horizontaux de
  // l'app, dividerColor) sans toucher aux bordures de tuiles/encadrés —
  // cf. demande explicite du user. Valeur inchangée ici (identique à
  // l'ancien cardBorder).
  audioBlockDividerColor: "#e5e4e7",
  // Pastille "2" ("Réponse" et équivalents) : examen blanc, examen écrit,
  // compréhension orale (bloc 3, OralAnswerCapture), révisions
  // (QuizzScreen), leçon/mot (MotScreen) et leçon/verbe (VerbeScreen) —
  // jusqu'ici validationGrisee/Pleine partagés avec TOUTES les autres
  // pastilles "Réponse" de l'app (onboarding...), découplés en V2 : fond
  // ET bordure = "Bg 2" ; chiffre = "Color 1" direct en clair, une dérivée
  // claire de "Color 1" en sombre — cf. demande explicite du user. Valeurs
  // inchangées ici (identiques aux anciens validationGrisee/Pleine).
  enonceBadgeVertBg: "#b2f2bb",
  enonceBadgeVertFg: "#2f9e44",
  // Bordure de la pastille "2" — jusqu'ici confondue avec la couleur du
  // chiffre (enonceBadgeVertFg), découplée pour la raccorder à "Bg 2" en
  // V2 sans dépendre du thème — cf. demande explicite du user. Valeur
  // inchangée ici (identique à l'ancien enonceBadgeVertFg).
  enonceBadgeVertBorder: "#2f9e44",
  // Piste des toggles "Pré-remplir avec la voix"/"Clavier hébreu" au sein
  // de HebrewInput, dans l'écran examen blanc uniquement (QuestionEcriteScreen,
  // mode "prof") — jusqu'ici var(--bg) partagé (le style ".switch" commun à
  // TOUS les usages de HebrewInput : inscription, connexion, dictionnaire...),
  // découplé pour le raccorder à la dérivée claire de "Vert5" en V2 sans
  // toucher aux autres usages de HebrewInput — cf. demande explicite du
  // user. Valeur inchangée ici (identique à l'ancien var(--bg)).
  examHebrewToggleTrack: "#ffffff",
};

const basePaletteDark = {
  textPrimary: "#f3f4f6",
  textSecondary: "#9ca3af",
  chromeTextPrimary: "#f3f4f6",
  chromeTextSecondary: "#9ca3af",
  bg: "#16171d",
  chromeBg: "#16171d",
  speakerIcon: "#000000",
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
  stepBadgeBlueBg: "#dbeafe",
  stepBadgeBlueFg: "#1d4ed8",
  stepBadgeOrangeBg: "#ffedd5",
  stepBadgeOrangeFg: "#c2410c",
  enonceSoft: "#9ca3af",
  examSpecialBg: "#f97316",
  tuileAlertBg: "#000000",
  audioPanelBg: "#ffffff",
  dividerColor: "#2e303a",
  audioToggleBg: "#000000",
  audioToggleFg: "#ffffff",
  texteRadioAccent: "#000000",
  traductionsSpeakerIcon: "#000000",
  citationBarColor: "#1e3a5f",
  examToggleTrack: "#4b4d57",
  examHebrewToggleTrack: "#16171d",
  examTraduisBadgeBg: "#dbeafe",
  examTraduisBadgeFg: "#1d4ed8",
  examTraduisBadgeBorder: "#1d4ed8",
  color2TitleColor: "#9ca3af",
  color1TitleColor: "#9ca3af",
  verbeVerticalDivider: "#2e303a",
  quizzSelectedBubbleFg: "#f3f4f6",
  bottomNavToggleLabelColor: "#9ca3af",
  accueilStarBg: "#ffd700",
  accueilLeconLogoBorder: "#f3f4f6",
  accueilLeconLogoBg: "none",
  texteImageBorder: "#2e303a",
  speedPillBg: "#2e303a",
  speedPillFg: "#9ca3af",
  timerFg: "#9ca3af",
  audioBlockBadgeBg: "#dbeafe",
  audioBlockIconColor: "#1e3a5f",
  audioBlockBadgeFg: "#1d4ed8",
  audioBlockBadgeBorder: "#1d4ed8",
  audioBlockIconColorLast: "#1e3a5f",
  questionOraleTitleColor: "#1e3a5f",
  audioBlockTimerColor: "#9ca3af",
  audioBlockSpeedFg: "#9ca3af",
  audioBlockDividerColor: "#2e303a",
  enonceBadgeVertBg: "#69db7c",
  enonceBadgeVertFg: "#40c057",
  enonceBadgeVertBorder: "#40c057",
};

// Palette V2 — regroupement de nuances demandé par le user (audit couleurs
// de cette session), THÈME CLAIR SEULEMENT. Toggle TEMPORAIRE (cf.
// ConfigContext.jsx/ConfigModal.jsx, "Nouvelle palette (test)") pour
// comparer côte à côte avec l'ancienne palette avant de trancher — à
// retirer une fois la décision prise (repasser basePaletteLight en unique
// source, ou remplacer ses valeurs par celles-ci).
//
// Réduite à 8 couleurs de BASE, éditables en direct (pipette ou champ
// hexadécimal, cf. ConfigModal) — tout le reste de la palette V2 est
// DÉRIVÉ de ces 8 couleurs par mélange linéaire sRGB, cf. computePaletteV2
// ci-dessous. Valeurs par défaut = celles retenues lors du regroupement
// initial (cf. demande explicite du user) :
// - Noir/Blanc : assignation directe (chromeBg+textPrimary / chromeTextPrimary+bg).
// - Gris1 (cardBg) : assignation directe, ne dérive rien (reste seul).
// - Gris5 : base de Gris2 (cardBorder, +70% blanc) et Gris7
//   (textSecondary+chromeDivider fusionnés, +38% vers #1a1a1a).
// - Bleu6 : base de Bleu9 (tileAccent, +65% vers #1a1a1a) et Bleu1
//   (stepBadgeBlueBg, +84% blanc) ; assigné aussi à logoAccent/stepBadgeBlueFg.
// - Vert5 : base de Vert1 (validationGrisee, +63% blanc) ; assigné aussi à
//   validationPleine/accent.
// - Rouge7 : base de Rouge1 (annulationGrisee, +74% blanc) ; assigné aussi
//   à annulationPleine/chromeDanger.
// - Orange5 : base de Orange8 (stepBadgeOrangeFg, -22% vers noir) et
//   Orange1 (stepBadgeOrangeBg, +82% blanc) ; assigné aussi à
//   warning/examSpecialBg.
// Deux dérivations restent un peu plus éloignées de leur ancienne cible
// que les autres (Bleu9, Orange8) : la base est plus saturée que l'ancienne
// teinte visée, aucun mélange simple ne rapproche parfaitement — cf.
// demande explicite du user ("je te laisse le choix de la fonction
// d'interpolation... tant que le résultat n'est pas trop éloigné").
export const PALETTE_V2_BASE_DEFAULTS = {
  noir: "#000000",
  blanc: "#ffffff",
  gris1: "#f4f3ec",
  gris5: "#9ca3af",
  bleu6: "#1d4ed8",
  vert5: "#2f9e44",
  rouge7: "#e03131",
  orange5: "#f97316",
};

// Skins prêts à l'emploi (jeu complet des 8 couleurs de base, cf.
// PALETTE_V2_BASE_DEFAULTS) — sélectionnables depuis Configuration en plus
// de la palette "Personnalisée" (éditable une à une). "kindle" capture les
// valeurs personnalisées choisies par le user lors de cette session
// d'ajustement de la palette V2 — cf. demande explicite du user.
export const SKIN_PRESETS = {
  kindle: {
    noir: "#1c2b4a",
    blanc: "#f3ecdc",
    gris1: "#fbf8f0",
    gris5: "#9ca3af",
    bleu6: "#d6c288",
    vert5: "#5c7a5e",
    rouge7: "#a8433a",
    orange5: "#f97316",
  },
};

export const SKIN_LABELS = {
  regular: "Regular",
  kindle: "Kindle",
  custom: "Personnalisée",
};

export const PALETTE_V2_BASE_LABELS = {
  noir: "Control 1",
  bleu6: "Control 2",
  blanc: "Bg 1",
  gris1: "Bg 2",
  vert5: "Color 1",
  rouge7: "Color 2",
  gris5: "Gris 5",
  orange5: "Orange 5",
};

function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex({ r, g, b }) {
  return (
    "#" +
    [r, g, b]
      .map((v) => clampByte(v).toString(16).padStart(2, "0"))
      .join("")
  );
}

// Mélange linéaire sRGB de `hexA` vers `hexB`, `t` dans [0,1] (0 = hexA
// pur, 1 = hexB pur) — cf. commentaire PALETTE_V2_BASE_DEFAULTS plus haut.
export function mixHex(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return rgbToHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  });
}

// Luminance relative perçue (0 = noir, 1 = blanc) — sert à détecter si la
// base "Bg 1" (blanc) est en réalité une couleur sombre (skin "dark"), pour
// adapter dynamiquement la direction des dérivées de Gris5 plutôt que de
// toujours mélanger vers le blanc — cf. demande explicite du user.
function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// Calcule la palette V2 complète (tous les tokens concernés) à partir des
// 8 couleurs de base — appelée à chaque édition d'une base (pipette ou
// champ hexadécimal, cf. ConfigModal) pour recalculer les dérivées en
// direct.
export function computePaletteV2(bases) {
  const b = { ...PALETTE_V2_BASE_DEFAULTS, ...bases };
  // Si "Bg 1" est sombre (skin "dark"), les dérivées de Gris5 qui jouaient
  // jusqu'ici un rôle de "bordure/séparateur discret sur fond clair" ou de
  // "texte/icône sombre lisible sur fond clair" doivent s'inverser — cf.
  // demande explicite du user. gris5Surface : dérivée pour les bordures/
  // séparateurs (vers le blanc en clair, vers le noir en sombre).
  // gris5Ink : dérivée pour le texte/les icônes (vers le noir en clair,
  // vers le blanc en sombre) — sens opposé à gris5Surface.
  const bg1IsDark = relativeLuminance(b.blanc) < 0.5;
  const gris5Surface = (t) => mixHex(b.gris5, bg1IsDark ? "#000000" : "#ffffff", t);
  const gris5Ink = (t) => mixHex(b.gris5, bg1IsDark ? "#ffffff" : "#1a1a1a", t);
  return {
    ...basePaletteLight,
    chromeBg: b.noir,
    textPrimary: b.noir,
    tuileAlertBg: b.vert5,
    accueilStarBg: b.rouge7,
    accueilLeconLogoBorder: b.blanc,
    accueilLeconLogoBg: b.noir,
    texteImageBorder: b.blanc,
    // Fond de la pastille de vitesse : reste TOUJOURS égal à "Bg 1" (même
    // couleur que le fond de la page, y compris en sombre) — cf. demande
    // explicite du user, ne pas appliquer le repli bg1IsDark ici.
    speedPillBg: b.blanc,
    // Police de la pastille de vitesse et horodatage/bouton lecture : "Color
    // 1" reste toujours sombre, illisible sur un fond de page sombre —
    // "Control 1" à la place quand bg1IsDark — cf. demande explicite du
    // user.
    speedPillFg: bg1IsDark ? b.noir : b.vert5,
    timerFg: bg1IsDark ? b.noir : b.vert5,
    audioBlockBadgeBg: b.gris1,
    audioBlockIconColor: bg1IsDark ? b.noir : gris5Ink(0.38),
    audioBlockBadgeFg: bg1IsDark ? mixHex(b.rouge7, "#ffffff", 0.7) : b.rouge7,
    audioBlockBadgeBorder: b.gris1,
    audioBlockIconColorLast: bg1IsDark ? b.noir : mixHex(b.vert5, "#1a1a1a", 0.65),
    questionOraleTitleColor: b.noir,
    audioBlockTimerColor: bg1IsDark ? b.noir : gris5Ink(0.38),
    audioBlockSpeedFg: bg1IsDark ? b.noir : gris5Ink(0.38),
    audioBlockDividerColor: b.gris1,
    enonceBadgeVertBg: b.gris1,
    enonceBadgeVertFg: bg1IsDark ? mixHex(b.vert5, "#ffffff", 0.7) : b.vert5,
    enonceBadgeVertBorder: b.gris1,
    chromeTextPrimary: b.blanc,
    bg: b.blanc,
    cardBg: b.gris1,
    audioPanelBg: b.gris1,
    dividerColor: b.gris1,
    audioToggleBg: bg1IsDark ? b.noir : b.vert5,
    audioToggleFg: b.gris1,
    texteRadioAccent: b.vert5,
    traductionsSpeakerIcon: b.noir,
    citationBarColor: b.rouge7,
    examToggleTrack: mixHex(b.vert5, "#ffffff", 0.63),
    examHebrewToggleTrack: mixHex(b.vert5, "#ffffff", 0.63),
    examTraduisBadgeBg: b.gris1,
    examTraduisBadgeFg: bg1IsDark ? mixHex(b.rouge7, "#ffffff", 0.7) : b.rouge7,
    examTraduisBadgeBorder: b.gris1,
    color2TitleColor: mixHex(b.rouge7, "#ffffff", 0.7),
    color1TitleColor: mixHex(b.vert5, "#ffffff", 0.7),
    verbeVerticalDivider: b.gris1,
    quizzSelectedBubbleFg: bg1IsDark ? b.vert5 : b.noir,
    bottomNavToggleLabelColor: bg1IsDark ? b.blanc : "#9ca3af",
    enonceSoft: b.gris5,
    cardBorder: gris5Surface(0.7),
    textSecondary: gris5Ink(0.38),
    // Reste hors de gris5Ink/gris5Surface : n'apparaît que dans le bandeau/
    // panneau (Layout.css), sur var(--chromeBg) = base "Noir" (toujours
    // sombre, indépendant de "Bg 1") — pas concerné par bg1IsDark.
    chromeDivider: mixHex(b.gris5, "#1a1a1a", 0.38),
    logoAccent: b.bleu6,
    stepBadgeBlueFg: b.bleu6,
    tileAccent: mixHex(b.bleu6, "#1a1a1a", 0.65),
    stepBadgeBlueBg: mixHex(b.bleu6, "#ffffff", 0.84),
    validationPleine: b.vert5,
    accent: b.vert5,
    validationGrisee: mixHex(b.vert5, "#ffffff", 0.63),
    annulationPleine: b.rouge7,
    chromeDanger: b.rouge7,
    annulationGrisee: mixHex(b.rouge7, "#ffffff", 0.74),
    warning: b.orange5,
    examSpecialBg: b.orange5,
    stepBadgeOrangeFg: mixHex(b.orange5, "#000000", 0.22),
    stepBadgeOrangeBg: mixHex(b.orange5, "#ffffff", 0.82),
  };
}

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
    stepBadgeBlueBg: p.stepBadgeBlueBg,
    stepBadgeBlueFg: p.stepBadgeBlueFg,
    stepBadgeOrangeBg: p.stepBadgeOrangeBg,
    stepBadgeOrangeFg: p.stepBadgeOrangeFg,
    enonceSoft: p.enonceSoft,
    examSpecialBg: p.examSpecialBg,
    tuileAlertBg: p.tuileAlertBg,
    audioPanelBg: p.audioPanelBg,
    dividerColor: p.dividerColor,
    audioToggleBg: p.audioToggleBg,
    audioToggleFg: p.audioToggleFg,
    texteRadioAccent: p.texteRadioAccent,
    traductionsSpeakerIcon: p.traductionsSpeakerIcon,
    citationBarColor: p.citationBarColor,
    examToggleTrack: p.examToggleTrack,
    examHebrewToggleTrack: p.examHebrewToggleTrack,
    examTraduisBadgeBg: p.examTraduisBadgeBg,
    examTraduisBadgeFg: p.examTraduisBadgeFg,
    examTraduisBadgeBorder: p.examTraduisBadgeBorder,
    color2TitleColor: p.color2TitleColor,
    color1TitleColor: p.color1TitleColor,
    verbeVerticalDivider: p.verbeVerticalDivider,
    quizzSelectedBubbleFg: p.quizzSelectedBubbleFg,
    bottomNavToggleLabelColor: p.bottomNavToggleLabelColor,
    accueilStarBg: p.accueilStarBg,
    accueilLeconLogoBorder: p.accueilLeconLogoBorder,
    accueilLeconLogoBg: p.accueilLeconLogoBg,
    texteImageBorder: p.texteImageBorder,
    speedPillBg: p.speedPillBg,
    speedPillFg: p.speedPillFg,
    timerFg: p.timerFg,
    audioBlockBadgeBg: p.audioBlockBadgeBg,
    audioBlockIconColor: p.audioBlockIconColor,
    audioBlockBadgeFg: p.audioBlockBadgeFg,
    audioBlockBadgeBorder: p.audioBlockBadgeBorder,
    audioBlockIconColorLast: p.audioBlockIconColorLast,
    questionOraleTitleColor: p.questionOraleTitleColor,
    audioBlockTimerColor: p.audioBlockTimerColor,
    audioBlockSpeedFg: p.audioBlockSpeedFg,
    audioBlockDividerColor: p.audioBlockDividerColor,
    enonceBadgeVertBg: p.enonceBadgeVertBg,
    enonceBadgeVertFg: p.enonceBadgeVertFg,
    enonceBadgeVertBorder: p.enonceBadgeVertBorder,
  };
}

export const appConfig = {
  theme: {
    light: buildTheme(basePaletteLight),
    dark: buildTheme(basePaletteDark),
    // Toggle temporaire (cf. ConfigContext.jsx) — pas d'équivalent sombre,
    // le regroupement demandé ne portait que sur le thème clair. Valeurs
    // par défaut (les 8 bases jamais retouchées) ; ConfigContext recalcule
    // via computePaletteV2() dès qu'une base est éditée.
    lightV2: buildTheme(computePaletteV2(PALETTE_V2_BASE_DEFAULTS)),
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
