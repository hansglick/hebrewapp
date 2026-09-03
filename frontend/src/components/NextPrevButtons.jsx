import "./NextPrevButtons.css";

// Icônes UI statiques servies depuis frontend/public/ (pas via mediaUrl/le
// backend) : backend/results/ est gitignored et jamais déployé, un chemin
// mediaUrl() y renverrait donc un 404 silencieux en production, cf. bug
// rapporté par le user (boutons invisibles sur mobile en prod).
const NEXT_ICON_URL = "/next.png";
const PREVIOUS_ICON_URL = "/previous.png";

// Boutons "précédent"/"suivant", présents sur tous les écrans "objet" (mot,
// verbe, chanson, texte, binyan, racine, dictionnaire, curiosité, quizz,
// questions écrite/orale) — mêmes actions que le swipe déjà en place sur
// ces écrans (cf. useSwipe), juste une alternative cliquable.
// `onPrevious`/`onNext` absent => le bouton correspondant n'est pas rendu,
// mais l'autre garde sa position (deux emplacements fixes, jamais un seul
// bouton qui se recentre).
// `variant` :
//  - "fixed" (défaut) : position:fixed, centré sur la hauteur de l'écran
//    (hors bandeau).
//  - "inline" : position:absolute sur un ancêtre position:relative propre à
//    l'écran appelant, pour aligner les boutons sur un élément précis de
//    son contenu (ex: la ligne horizontale de leçon/mot) plutôt que sur le
//    centre de l'écran.
//  - "static" : flux normal (pas de position), pleine largeur de son
//    conteneur — pour placer les boutons à un endroit précis de la mise en
//    page (ex: au-dessus d'une phrase, leçon/traduction) plutôt qu'en
//    survol de l'écran.
// Cf. demandes explicites du user.
export function NextPrevButtons({ onPrevious, onNext, variant = "fixed" }) {
  return (
    <div
      className={`next-prev-bar${variant !== "fixed" ? ` next-prev-bar-${variant}` : ""}`}
      aria-hidden={!onPrevious && !onNext}
    >
      <div className="next-prev-slot">
        {onPrevious && (
          <button type="button" className="next-prev-btn" onClick={onPrevious} aria-label="Précédent">
            <img src={PREVIOUS_ICON_URL} alt="" />
          </button>
        )}
      </div>
      <div className="next-prev-slot">
        {onNext && (
          <button type="button" className="next-prev-btn" onClick={onNext} aria-label="Suivant">
            <img src={NEXT_ICON_URL} alt="" />
          </button>
        )}
      </div>
    </div>
  );
}
