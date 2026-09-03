import "./BottomNavBar.css";

// Barre de navigation précédent/suivant fixe en bas de l'écran, présente
// sur tous les écrans "objet" (mot, verbe, chanson, texte, binyan, racine,
// dictionnaire, curiosité, quizz, questions écrite/orale) — remplace les
// anciens boutons flottants NextPrevButtons, cf. demande explicite du
// user. Mêmes actions que le swipe déjà en place sur ces écrans (cf.
// useSwipe), juste une alternative cliquable. `onPrevious`/`onNext`
// absent => le bouton correspondant n'est pas rendu, mais l'autre garde
// sa position (deux emplacements fixes, jamais un seul bouton qui se
// recentre).
export function BottomNavBar({ onPrevious, onNext }) {
  return (
    <div className="bottom-nav-bar" aria-hidden={!onPrevious && !onNext}>
      <div className="bottom-nav-slot">
        {onPrevious && (
          <button type="button" className="bottom-nav-btn" onClick={onPrevious} aria-label="Précédent">
            <span className="bottom-nav-icon bottom-nav-icon-prev" />
          </button>
        )}
      </div>
      <div className="bottom-nav-slot">
        {onNext && (
          <button type="button" className="bottom-nav-btn" onClick={onNext} aria-label="Suivant">
            <span className="bottom-nav-icon" />
          </button>
        )}
      </div>
    </div>
  );
}
