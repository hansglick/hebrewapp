import { progressColor } from "./progressColor";

// Message + couleur pour l'indicateur de progression d'exploration d'une
// leçon (B/A sur mots+verbes+traductions+texte+oral), réutilisé par
// LeconDetailScreen et le bouton "Leçon en cours" de l'accueil.
export function leconProgressMessage(percent) {
  const color = progressColor(percent);
  if (percent >= 100) {
    return {
      color,
      message: "Tu as parcouru toute la leçon, commence à préparer l'examen dès maintenant en révisant!",
    };
  }
  if (percent > 80) {
    return { color, message: "Tu as presque fini! juste 5 min d'efforts" };
  }
  if (percent >= 60) {
    return { color, message: "Continue, tu es sur la bonne voie" };
  }
  return { color, message: "Tu n'as même pas fais la moitié de la leçon!" };
}
