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
//
// `center` (optionnel) : contenu additionnel sur la même ligne, entre les
// deux flèches (ex: les toggles FR/HE et Auto/Teacher de révisions/
// traduction, cf. demande explicite du user) — quand fourni, les flèches
// reviennent aux extrémités de la barre (plus de rapprochement vers le
// centre, cf. .bottom-nav-inner) puisque l'espace central est alors
// occupé par du vrai contenu plutôt que du vide.
export function BottomNavBar({ onPrevious, onNext, center }) {
  if (center) {
    return (
      <div className="bottom-nav-bar bottom-nav-bar-with-center" aria-hidden={!onPrevious && !onNext && !center}>
        <div className="bottom-nav-slot">
          {onPrevious && (
            <button type="button" className="bottom-nav-btn" onClick={onPrevious} aria-label="Précédent">
              <span className="bottom-nav-icon bottom-nav-icon-prev" />
            </button>
          )}
        </div>
        <div className="bottom-nav-center">{center}</div>
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

  return (
    <div className="bottom-nav-bar" aria-hidden={!onPrevious && !onNext}>
      <div className="bottom-nav-inner">
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
    </div>
  );
}

// Toggle FR/HE ou Auto/Teacher pour la barre inférieure (cf. BottomNavBar
// `center`) : rond blanc glissant sur un petit rail gris, avec un libellé
// de chaque côté — cf. demande explicite du user.
export function BottomNavToggle({ leftLabel, rightLabel, value, onChange }) {
  return (
    <div className="bottom-nav-toggle-group">
      <span className="bottom-nav-toggle-label">{leftLabel}</span>
      <button
        type="button"
        className={`bottom-nav-toggle${value ? " on" : ""}`}
        onClick={() => onChange(!value)}
        aria-label={`${leftLabel} / ${rightLabel}`}
      >
        <span className="bottom-nav-toggle-knob" />
      </button>
      <span className="bottom-nav-toggle-label">{rightLabel}</span>
    </div>
  );
}
