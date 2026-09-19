// Zones cliquables de l'image "Coin culture fast" (homepageomer.png,
// 1254x1254px) — polygones tracés à la main sur l'image (cf. demande
// explicite du user, effet "soigné" plutôt que des rectangles bruts).
// `rawTypes` : type(s) "curiosité" bruts (cf. app/curiosites.py côté
// backend) couverts par ce segment ; `route(chapId, code)` : destination si
// le segment est disponible pour la leçon. La bible fusionne 3 types en un
// seul ensemble parcourable sans distinction (cf. CuriositeBibleLessonScreen).
// `itemLabel` : utilisé dans le message "Pas d'item ... présent dans cette
// leçon" affiché au 2e tap/clic sur un segment indisponible — cf. demande
// explicite du user.
// `alwaysAvailable` : segment non rattaché au système de déblocage par
// leçon (cf. `chanson` ci-dessous, qui pointe vers le portail général des
// chansons, jamais grisé/verrouillé) — cf. demande explicite du user.
export const CULTURE_IMAGE_SIZE = 1254;

export const COIN_CULTURE_ZONES = [
  {
    key: "presse",
    rawTypes: ["presse"],
    message: "Lisez la première page d'un quotidien en remontant le temps",
    itemLabel: "de presse",
    points: "0,0 605,5 635,25 615,430 598,465 60,510 0,465",
    anchor: { x: 300, y: 220 },
    route: (chapId, code) => `/apprentissage/${chapId}/${code}/curiosite/presse`,
  },
  {
    key: "landmark",
    rawTypes: ["landmark"],
    message: "Découvrez les merveilles d'Israël",
    itemLabel: "de lieu à visiter",
    points: "605,5 1015,15 1030,150 1005,235 975,410 860,388 700,300 615,115",
    anchor: { x: 820, y: 170 },
    route: (chapId, code) => `/apprentissage/${chapId}/${code}/curiosite/landmark`,
  },
  {
    key: "blague",
    rawTypes: ["blague"],
    message: "Découvrez des blagues israéliennes",
    itemLabel: "de blague",
    points: "650,400 900,370 1000,400 1015,470 930,600 745,615 650,520",
    anchor: { x: 830, y: 480 },
    route: (chapId, code) => `/apprentissage/${chapId}/${code}/curiosite/blague`,
  },
  {
    key: "chanson",
    rawTypes: [],
    alwaysAvailable: true,
    message: "Chante tes chansons israéliennes préférées !",
    itemLabel: "de chanson",
    points: "495,530 990,610 1000,1095 480,1030",
    anchor: { x: 745, y: 800 },
    route: () => "/fun/chansons",
  },
  {
    key: "hebreworiginword",
    rawTypes: ["hebreworiginword"],
    message: "Découvrez les mots français d'origine biblique",
    itemLabel: "de mot d'origine biblique",
    points: "1010,0 1254,20 1225,435 965,415",
    anchor: { x: 1120, y: 200 },
    route: (chapId, code) => `/apprentissage/${chapId}/${code}/curiosite/hebreworiginword`,
  },
  {
    key: "expression",
    rawTypes: ["expression"],
    message: "Découvrez des expressions idiomatiques israéliennes",
    itemLabel: "d'expression",
    points: "995,680 1205,690 1195,1165 970,1140",
    anchor: { x: 1090, y: 900 },
    route: (chapId, code) => `/apprentissage/${chapId}/${code}/curiosite/expression`,
  },
  {
    key: "bible",
    rawTypes: ["recit", "tanakh", "proverb"],
    message: "Découvrez les récits, les citations et les proverbes extraits du Tanakh",
    itemLabel: "biblique",
    points: "10,495 430,545 415,900 345,1180 300,1254 0,1254 0,500",
    anchor: { x: 190, y: 800 },
    route: (chapId, code) => `/apprentissage/${chapId}/${code}/curiosite-bible`,
  },
];
