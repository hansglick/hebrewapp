import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { getRacine, getRandomRacine } from "../../api/content";
import { mediaUrl } from "../../api/media";
import { useSwipe } from "../../hooks/useSwipe";
import "../screens.css";

// Accessible uniquement depuis le lien d'un mot (racine précise).
// Swipe droite : explore une autre racine aléatoire. Swipe gauche : retour
// à l'écran du mot d'origine (convention gauche=retour/historique, droite=
// aléatoire utilisée partout ailleurs dans l'app). Le mot exact quitté
// transite via location.state (returnPath/mot), posé par MotScreen, pour
// que le retour ne retombe pas sur un tirage aléatoire.
export default function RacineScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { shoresh } = useParams();
  const [racine, setRacine] = useState(null);

  useEffect(() => {
    getRacine(shoresh).then(setRacine);
  }, [shoresh]);

  const swipeHandlers = useSwipe({
    onSwipeLeft: () => {
      const { returnPath, mot } = location.state ?? {};
      if (returnPath) {
        navigate(returnPath, { state: { restoreMot: mot } });
      } else {
        navigate(-1);
      }
    },
    onSwipeRight: () => getRandomRacine().then(setRacine),
  });

  if (!racine) return null;

  return (
    <section className="screen" {...swipeHandlers}>
      <img
        className="screen-image"
        src={mediaUrl(racine.path)}
        alt={racine.shoresh}
        draggable={false}
      />
      <h1 className="hebrew-large">{racine.shoresh}</h1>
      <p className="muted">{racine.sens}</p>
      <ul className="words-list">
        {racine.words.map((w) => (
          <li key={w.hebrew} className="hebrew">
            {w.hebrew} ({w.french})
          </li>
        ))}
      </ul>
    </section>
  );
}
