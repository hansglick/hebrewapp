// Zones cliquables de l'image "Coin culture fast" (culturehomepage.png,
// 1254x1254px) — polygones tracés à la main sur l'image (cf. demande
// explicite du user, effet "soigné" plutôt que des rectangles bruts).
// `rawTypes` : type(s) "curiosité" bruts (cf. app/curiosites.py côté
// backend) couverts par ce segment ; `route(chapId, code)` : destination si
// le segment est disponible pour la leçon. La bible fusionne 3 types en un
// seul ensemble parcourable sans distinction (cf. CuriositeBibleLessonScreen).
// `itemLabel` : utilisé dans le message "Pas d'item ... présent dans cette
// leçon" affiché au 2e tap sur un segment indisponible (mobile) — cf.
// demande explicite du user.
export const CULTURE_IMAGE_SIZE = 1254;

export const COIN_CULTURE_ZONES = [
  {
    key: "presse",
    rawTypes: ["presse"],
    message: "Lisez la première page d'un quotidien en remontant le temps",
    itemLabel: "de presse",
    points: "0,10 600,0 635,25 615,440 600,465 60,510 0,460",
    anchor: { x: 300, y: 200 },
    route: (chapId, code) => `/apprentissage/${chapId}/${code}/curiosite/presse`,
  },
  {
    key: "landmark",
    rawTypes: ["landmark"],
    message: "Découvrez les merveilles d'Israël",
    itemLabel: "de lieu à visiter",
    points: "605,10 965,0 995,235 975,405 860,385 700,300 615,115",
    anchor: { x: 800, y: 150 },
    route: (chapId, code) => `/apprentissage/${chapId}/${code}/curiosite/landmark`,
  },
  {
    key: "blague",
    rawTypes: ["blague"],
    message: "Découvrez des blagues israéliennes",
    itemLabel: "de blague",
    points: "645,410 700,360 900,368 1000,400 1015,465 905,600 745,588 650,505",
    anchor: { x: 830, y: 480 },
    route: (chapId, code) => `/apprentissage/${chapId}/${code}/curiosite/blague`,
  },
  {
    key: "expression",
    rawTypes: ["expression"],
    message: "Découvrez des expressions idiomatiques israéliennes",
    itemLabel: "d'expression",
    points: "455,610 760,555 800,1060 770,1130 460,1125 420,650",
    anchor: { x: 600, y: 750 },
    route: (chapId, code) => `/apprentissage/${chapId}/${code}/curiosite/expression`,
  },
  {
    key: "hebreworiginword",
    rawTypes: ["hebreworiginword"],
    message: "Découvrez les mots français d'origine biblique",
    itemLabel: "de mot d'origine biblique",
    points: "815,660 1090,610 1120,1000 1090,1150 830,1145 800,700",
    anchor: { x: 960, y: 800 },
    route: (chapId, code) => `/apprentissage/${chapId}/${code}/curiosite/hebreworiginword`,
  },
  {
    key: "bible",
    rawTypes: ["recit", "tanakh", "proverb"],
    message: "Découvrez les récits, les citations et les proverbes extraits du Tanakh",
    itemLabel: "biblique",
    points: "20,495 430,540 415,900 340,1180 300,1254 0,1254 0,500",
    anchor: { x: 180, y: 750 },
    route: (chapId, code) => `/apprentissage/${chapId}/${code}/curiosite-bible`,
  },
];
