// Nikkoud (voyelles, dagesh, points du ש) et signes de cantillation ; le maqaf
// (־) et la ponctuation hébraïque restent.
const NIKKUD = /[֑-ׇֽֿׁׂׅׄ]/g;

// Hébreu affiché sans nikkoud : prises de parole du prof, réponses de l'élève
// (cf. demande explicite du user).
export const withoutNikkud = (text) => text.replace(NIKKUD, "");

// Découpe en caractères visibles (une lettre et ses éventuels signes
// apparaissent ensemble), pour l'écriture simulée caractère par caractère.
export const graphemes = (text) =>
  Array.from(
    new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text),
    (s) => s.segment,
  );
