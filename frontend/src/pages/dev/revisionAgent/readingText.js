// Nom du personnage qui prend la parole, en tête d'une réplique de dialogue
// (« דוד: שלום רוני… ») : l'élève ne le lit pas (cf. ComprehensionBoard).
export const SPEAKER = /^[^:.?!,]{1,20}:\s*/;

// Retour à la ligne entre deux phrases lues, comme dans l'évaluation du backend (cf. reading.READING_BREAK).
const READING_BREAK = " \n ";

// Le texte à lire de l'extrait, tel que le backend l'évalue (cf. reading.evaluate) : les phrases surlignées, sans le
// nom du personnage, une par ligne. La fenêtre de la réponse l'affiche dès l'envoi de la lecture (cf. StudentAnswer).
export const extractText = (text, extract) =>
  text && extract ? extract.phrases.map((i) => text.phrases[i].replace(SPEAKER, "").trim()).join(READING_BREAK) : null;
