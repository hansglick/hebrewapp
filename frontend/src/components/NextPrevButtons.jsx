import { mediaUrl } from "../api/media";
import "./NextPrevButtons.css";

const NEXT_ICON_URL = mediaUrl("logos/next.png");
const PREVIOUS_ICON_URL = mediaUrl("logos/previous.png");

// Boutons "précédent"/"suivant" fixés en bas de l'écran (sans toucher le
// bord), présents sur tous les écrans "objet" (mot, verbe, chanson, texte,
// binyan, racine, dictionnaire, curiosité, quizz, questions écrite/orale) —
// mêmes actions que le swipe déjà en place sur ces écrans (cf. useSwipe),
// juste une alternative cliquable. `onPrevious`/`onNext` absent => le
// bouton correspondant n'est pas rendu, mais l'autre garde sa position
// (deux emplacements fixes, jamais un seul bouton qui se recentre).
export function NextPrevButtons({ onPrevious, onNext }) {
  return (
    <div className="next-prev-bar" aria-hidden={!onPrevious && !onNext}>
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
